import { useEffect, useMemo, useState } from "react";
import { api, type CatalogItem } from "./api";

function explain(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  try {
    const body = JSON.parse(text) as { detail?: string };
    if (typeof body.detail === "string") return body.detail;
  } catch {
    /* The API sometimes returns plain text. */
  }
  return text;
}

function weightLine(item: CatalogItem): string | null {
  if (item.weight == null) return null;
  const n = Number(item.weight);
  if (!Number.isFinite(n)) return null;
  return `${n} lb`;
}

export function ItemsPanel() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [url, setUrl] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function reload() {
    setItems(await api.listItems());
  }

  useEffect(() => {
    void reload().catch((err) => setNotice(explain(err)));
  }, []);

  const types = useMemo(() => {
    const found = new Set<string>();
    for (const item of items) {
      if (item.item_type) found.add(item.item_type);
    }
    return [...found].sort();
  }, [items]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (kind !== "all" && item.item_type !== kind) return false;
      if (!needle) return true;
      return (
        item.name.toLowerCase().includes(needle) ||
        (item.summary || "").toLowerCase().includes(needle) ||
        (item.rarity || "").toLowerCase().includes(needle)
      );
    });
  }, [items, kind, query]);

  async function importUrl() {
    const link = url.trim();
    if (!link) return;
    setBusy(true);
    setNotice("");
    try {
      await api.importItemUrl(link);
      setUrl("");
      await reload();
    } catch (err) {
      setNotice(explain(err));
    } finally {
      setBusy(false);
    }
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setNotice("");
    try {
      await api.importItemFile(file);
      await reload();
    } catch (err) {
      setNotice(explain(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="items-page">
      <div className="items-bar">
        <h2>Items</h2>
        <input
          value={query}
          placeholder="Search"
          onChange={(event) => setQuery(event.target.value)}
        />
        <select value={kind} onChange={(event) => setKind(event.target.value)}>
          <option value="all">All types</option>
          {types.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <form
          className="items-import"
          onSubmit={(event) => {
            event.preventDefault();
            void importUrl();
          }}
        >
          <input
            value={url}
            placeholder="lootstash.app item link"
            onChange={(event) => setUrl(event.target.value)}
          />
          <button type="submit" className="btn" disabled={busy}>
            Import
          </button>
        </form>
        <label className="btn file-btn">
          JSON file
          <input
            type="file"
            accept="application/json,.json"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void importFile(file);
            }}
          />
        </label>
      </div>
      {notice && <p className="items-notice">{notice}</p>}
      <div className="item-grid">
        {shown.map((item) => {
          const weight = weightLine(item);
          const type = item.item_type || "item";
          return (
            <article key={item.id} className={`item-card ${type}`}>
              <div className="item-card-type">
                <span>{type}</span>
                {item.rarity && <span>{item.rarity}</span>}
              </div>
              <h3>{item.name}</h3>
              {item.summary && <p>{item.summary}</p>}
              <div className="item-card-meta">
                {weight && <span>{weight}</span>}
                {item.value && <span>{item.value}</span>}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
