"use client";
import { useEffect, useState } from "react";
import { Plus, Users, Lock, Send, X } from "lucide-react";
import { api } from "@/lib/api";
import { keys, encrypt, decrypt } from "@/lib/crypto";
import type { Group, Message, Person } from "@/lib/model";
import type { Friend } from "./Map";
type GroupView = Group & {
  active: boolean;
  people: Pick<Person, "id" | "name" | "initials" | "color" | "publicKey">[];
};
export default function GroupChats({
  me,
  friends,
  revision,
  notify,
}: {
  me: Person;
  friends: Friend[];
  revision: unknown;
  notify: (s: string) => void;
}) {
  const [groups, setGroups] = useState<GroupView[]>([]),
    [selected, setSelected] = useState(""),
    [creating, setCreating] = useState(false),
    [messages, setMessages] = useState<(Message & { plain: string })[]>([]),
    [draft, setDraft] = useState(""),
    [busy, setBusy] = useState(false);
  const group = groups.find((g) => g.id === selected);
  useEffect(() => {
    api<GroupView[]>("/groups")
      .then(setGroups)
      .catch((e) => notify(e.message));
  }, [revision, notify]);
  useEffect(() => {
    let active = true;
    setMessages([]);
    if (!group?.active) return;
    api<Message[]>(`/groups/${selected}/messages`)
      .then(async (rows) => {
        const pair = await keys(me.id);
        const result = await Promise.all(
          rows.map(async (m) => ({
            ...m,
            plain: await decrypt(m, me.id, pair),
          })),
        );
        if (active) setMessages(result);
      })
      .catch((e) => notify(e.message));
    return () => {
      active = false;
    };
  }, [groups, selected, me.id, notify]);
  return (
    <section className="messages-layout">
      <aside className="conversation-list">
        <div className="section-heading">
          <h2>Local groups</h2>
          <button
            className="icon-button"
            aria-label="Create local group"
            onClick={() => setCreating(true)}
          >
            <Plus size={18} />
          </button>
        </div>
        {groups.map((g) => (
          <button
            className={`friend-row ${selected === g.id ? "chosen" : ""}`}
            key={g.id}
            onClick={() => {
              setSelected(g.id);
              setCreating(false);
            }}
          >
            <Users size={25} />
            <div className="friend-info">
              <strong>{g.name}</strong>
              <span>
                {g.members.length} people · {g.active ? "Nearby" : "Paused"}
              </span>
            </div>
          </button>
        ))}
        {!groups.length && (
          <p className="muted">Create a group for a shared moment nearby.</p>
        )}
      </aside>
      <div className="chat-panel">
        {creating ? (
          <form
            className="group-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const f = new FormData(e.currentTarget);
              try {
                const result = await api<Group>("/groups", {
                  method: "POST",
                  body: JSON.stringify({
                    name: f.get("name"),
                    members: f.getAll("members"),
                  }),
                });
                setGroups(await api("/groups"));
                setSelected(result.id);
                setCreating(false);
                notify("Your local group is ready");
              } catch (e) {
                notify((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="section-heading">
              <h2>Bring a few friends together</h2>
              <button
                className="icon-button"
                type="button"
                onClick={() => setCreating(false)}
                aria-label="Cancel group creation"
              >
                <X size={18} />
              </button>
            </div>
            <p className="muted">
              Choose 2–7 friends. Everyone must be mutually connected and within
              2 km of each other with location sharing on.
            </p>
            <label>
              Group name
              <input
                name="name"
                required
                minLength={2}
                maxLength={50}
                placeholder="Coffee around the corner"
              />
            </label>
            {friends
              .filter((f) => f.nearby)
              .map((f) => (
                <label className="check-label" key={f.id}>
                  <input type="checkbox" name="members" value={f.id} />
                  {f.name}
                </label>
              ))}
            <button className="primary" disabled={busy}>
              Create local group
            </button>
          </form>
        ) : group ? (
          <>
            <div className="chat-heading">
              <Users size={30} />
              <div>
                <h2>{group.name}</h2>
                <small>
                  {group.people.map((p) => p.name.split(" ")[0]).join(", ")}
                </small>
              </div>
              <span className="pill">
                {group.active ? "Together nearby" : "Paused"}
              </span>
            </div>
            <div className="chat-messages">
              {!messages.length && (
                <div className="empty-state">
                  <Users size={40} />
                  <h2>
                    {group.active
                      ? "Everyone’s here."
                      : "A little too far apart."}
                  </h2>
                  <p>
                    {group.active
                      ? "Group messages are encrypted separately for each member. Everyone needs to open the app to create their chat key."
                      : "This conversation resumes when all members are sharing their location and within 2 km of each other."}
                  </p>
                </div>
              )}
              {messages.map((m) => (
                <div
                  className={`message ${m.from === me.id ? "outgoing" : "incoming"}`}
                  key={m.id}
                >
                  <small>
                    {group.people.find((p) => p.id === m.from)?.name}
                  </small>
                  <p>{m.plain}</p>
                </div>
              ))}
            </div>
            <form
              className="message-composer"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!draft.trim()) return;
                setBusy(true);
                try {
                  const pair = await keys(me.id);
                  const envelopes = await Promise.all(
                    group.people.map(async (p) => {
                      if (!p.publicKey)
                        throw Error(
                          `${p.name} needs to open FriendCircle to set up encrypted chat.`,
                        );
                      return {
                        to: p.id,
                        ...(await encrypt(draft, pair, p.publicKey)),
                      };
                    }),
                  );
                  await api(`/groups/${group.id}/messages`, {
                    method: "POST",
                    body: JSON.stringify({ envelopes }),
                  });
                  setDraft("");
                  setGroups(await api("/groups"));
                } catch (e) {
                  notify((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <input
                aria-label="Group message"
                placeholder="Make a plan together…"
                maxLength={4000}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={!group.active}
              />
              <button
                className="primary"
                aria-label="Send group message"
                disabled={busy || !draft.trim() || !group.active}
              >
                <Send size={19} />
              </button>
            </form>
            <div className="encryption-note">
              <Lock size={12} /> Encrypted for each member. Available only while
              your group is nearby.
            </div>
          </>
        ) : (
          <div className="empty-state">
            <Users size={40} />
            <h2>A small group. A shared moment.</h2>
            <p>
              Local groups bring mutual friends together within a 2 km
              neighbourhood.
            </p>
            <button className="primary" onClick={() => setCreating(true)}>
              <Plus size={17} /> Create a local group
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
