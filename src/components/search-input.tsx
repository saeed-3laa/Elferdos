"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Scope = "catalog" | "products" | "pricing" | "customers" | "orders";
type Suggestion = { id: string; label: string; detail: string; value: string };
export function SearchInput({ scope, id, defaultValue = "", placeholder, maxLength = 160, label }: {
  scope: Scope; id?: string; defaultValue?: string; placeholder?: string; maxLength?: number; label: string;
}) {
  const generated = useId(), listId = `${generated}-results`;
  const [value, setValue] = useState(defaultValue);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false), [active, setActive] = useState(-1);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const input = useRef<HTMLInputElement>(null);
  const revision = useRef(0);
  const router = useRouter();
  useEffect(() => {
    if (!open || !value.trim()) return;
    const controller = new AbortController(), current = revision.current;
    const timer = setTimeout(async () => {
      const params = new URLSearchParams({ scope, q: value.trim() });
      const form = input.current?.form;
      if (form) for (const key of ["category", "state", "available", "status", "from", "to"]) {
        const field = new FormData(form).get(key);
        if (typeof field === "string" && field) params.set(key, field);
      }
      try {
        const response = await fetch(`/api/search?${params}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("SEARCH_FAILED");
        const result = await response.json() as { items: Suggestion[] };
        if (!controller.signal.aborted && current === revision.current) { setItems(result.items); setState("done"); }
      } catch {
        if (!controller.signal.aborted && current === revision.current) { setItems([]); setState("error"); }
      }
    }, 220);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [value, open, scope]);
  function select(item: Suggestion) {
    revision.current++;
    setOpen(false);
    setValue(item.label);
    const form = input.current?.form;
    const params = new URLSearchParams();
    if (form) for (const [key, field] of new FormData(form)) if (typeof field === "string" && key !== "after") params.set(key, field);
    params.set("q", item.value);
    const href = scope === "products" ? `/admin/products/${item.id}`
      : scope === "customers" ? `/admin/customers/${item.id}`
      : scope === "orders" ? `/admin/orders/${item.id}`
      : `${scope === "pricing" ? "/admin/pricing" : "/"}?${params}`;
    router.push(href);
  }
  const expanded = open && !!value.trim();
  return <div className="search-autocomplete" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) { revision.current++; setOpen(false); }
  }}>
    <input ref={input} id={id ?? generated} name="q" type="search" role="combobox" aria-label={label}
      aria-autocomplete="list" aria-expanded={expanded} aria-controls={listId}
      aria-activedescendant={expanded && active >= 0 && items[active] ? `${listId}-${active}` : undefined}
      autoComplete="off" maxLength={maxLength} placeholder={placeholder} value={value}
      onFocus={() => { if (value.trim()) { setOpen(true); setState("loading"); } }}
      onChange={event => { revision.current++; setValue(event.target.value); setItems([]); setActive(-1); setState("loading"); setOpen(true); }}
      onKeyDown={event => {
        if (event.key === "Escape") { revision.current++; setOpen(false); setActive(-1); }
        else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault(); setOpen(true);
          if (items.length) setActive(previous => event.key === "ArrowDown" ? (previous + 1) % items.length : (previous <= 0 ? items.length - 1 : previous - 1));
        } else if (event.key === "Enter" && expanded && active >= 0 && items[active]) { event.preventDefault(); select(items[active]); }
      }} />
    {expanded && <div className="search-suggestions">
      <ul role="listbox" id={listId} aria-label="اقتراحات البحث">{items.map((item, index) => <li
        id={`${listId}-${index}`} role="option" aria-selected={active === index} key={item.id}
        onPointerDown={event => event.preventDefault()} onClick={() => select(item)}>
        <span>{item.label}</span><small>{item.detail}</small>
      </li>)}</ul>
      <p role="status" aria-live="polite">{state === "loading" ? "جارٍ البحث…" : state === "error" ? "تعذّر تحميل الاقتراحات. يمكنك الضغط على زر البحث." : items.length ? "اختر نتيجة أو استخدم الأسهم ثم Enter" : "لا توجد اقتراحات مطابقة"}</p>
    </div>}
  </div>;
}
