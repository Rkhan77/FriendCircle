"""Private face-presence detector. No face recognition, identity or age inference."""
import io
import os
import secrets
import threading
from contextlib import asynccontextmanager

import mediapipe as mp
import numpy as np
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError

Image.MAX_IMAGE_PIXELS = 16_000_000
TOKEN = os.environ.get("FACE_VERIFIER_TOKEN", "")
MODEL_PATH = os.environ.get("MODEL_PATH", "blaze_face_short_range.tflite")
lock = threading.Lock()
detector = None

@asynccontextmanager
async def lifespan(app):
    global detector
    if len(TOKEN) < 24:
        raise RuntimeError("Set a private FACE_VERIFIER_TOKEN with at least 24 characters")
    options = mp.tasks.vision.FaceDetectorOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=MODEL_PATH),
        min_detection_confidence=0.5,
        running_mode=mp.tasks.vision.RunningMode.IMAGE,
    )
    detector = mp.tasks.vision.FaceDetector.create_from_options(options)
    yield
    detector.close()

app = FastAPI(title="FriendCircle private photo verifier", lifespan=lifespan)

@app.post("/verify")
def verify(photo: UploadFile = File(...), authorization: str = Header(default="")):
    if not secrets.compare_digest(authorization, f"Bearer {TOKEN}"):
        raise HTTPException(401, "Unauthorized")
    content = photo.file.read(8 * 1024 * 1024 + 1)
    if len(content) > 8 * 1024 * 1024:
        raise HTTPException(413, "Photo exceeds 8 MB")
    try:
        with Image.open(io.BytesIO(content)) as source:
            source.load()
            image = ImageOps.exif_transpose(source).convert("RGB")
            image.thumbnail((1280, 1280))
            frame = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.array(image))
        with lock:
            result = detector.detect(frame)
        scores = []
        for detection in result.detections:
            box = detection.bounding_box
            score = detection.categories[0].score
            # Small or edge-clipped faces go to manual review, not automatic approval.
            if (min(box.width, box.height) < 55 or box.origin_x < 0 or box.origin_y < 0
                or box.origin_x + box.width > image.width
                or box.origin_y + box.height > image.height):
                score = min(score, 0.5)
            scores.append(float(score))
        return {"faceCount": len(scores), "confidence": min(scores) if scores else 0.0}
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise HTTPException(400, "Invalid or oversized image")
