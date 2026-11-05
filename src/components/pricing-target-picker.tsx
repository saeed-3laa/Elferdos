"use client";

import { useEffect, useId, useRef, useState } from "react";
import { z } from "zod";

const resultsSchema = z.object({ items: z.array(z.object({ id: z.uuid(), label: z.string(), detail: z.string() })).max(8) });
type TargetKind = "product" | "category" | "unit";

/** Selection submits an ID; editing the text clears it so stale selections cannot be saved. */
export function PricingTargetPicker({ initialScope = "all", initialLabel = "", unitOnly = false }: {
  initialScope?: string; initialLabel?: string; unitOnly?: boolean;
}) {
  const [initialKind, initialId] = initialScope.split(":");
  const [kind, setKind] = useState(unitOnly ? "unit" : initialKind ?? "all");
  const [selected, setSelected] = useState(initialId ?? "");
  const [text, setText] = useState(initialLabel);
  const [items, setItems] = useState<z.infer<typeof resultsSchema>["items"]>([]);
  const [open, setOpen] = useState(false), [active, setActive] = useState(-1);
  const [status, setStatus] = useState("");
  const listId = useId(), generation = useRef(0);
  useEffect(() => {
    if (!open || !text.trim() || kind === "all") return;
    const controller = new AbortController(), current = generation.current;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/pricing-targets?${new URLSearchParams({ kind, q: text.trim() })}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("SEARCH_FAILED");
        const result = resultsSchema.parse(await response.json());
        if (!controller.signal.aborted && current === generation.current) {
          setItems(result.items); setStatus(result.items.length ? "اختار نتيجة بالضغط أو الأسهم ثم Enter" : "لا توجد نتائج مطابقة؛ جرّب اسمًا آخر");
        }
      } catch {
        if (!controller.signal.aborted && current === generation.current) { setItems([]); setStatus("تعذّر البحث. حاول مرة أخرى."); }
      }
    }, 220);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [kind, open, text]);
  function choose(item: z.infer<typeof resultsSchema>["items"][number]) {
    generation.current++; setSelected(item.id); setText(item.label); setOpen(false); setActive(-1);
  }
  const noun = kind === "category" ? "القسم" : kind === "unit" ? "وحدة المنتج" : "المنتج";
  return <div className="pricing-target-picker">
    <input type="hidden" name={unitOnly ? "unit" : "scope"} value={unitOnly ? selected : kind === "all" ? "all" : `${kind}:${selected}`} />
    {!unitOnly && <label>العرض على<select value={kind} onChange={event => {
      generation.current++; setKind(event.target.value as TargetKind | "all"); setSelected(""); setText(""); setItems([]); setOpen(false); setActive(-1); setStatus("");
    }}><option value="product">منتج</option><option value="category">قسم كامل</option><option value="all">كل المنتجات</option>{initialKind === "unit" && <option value="unit">وحدة المنتج الحالية</option>}</select></label>}
    {kind !== "all" && <div className="search-autocomplete" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { generation.current++; setOpen(false); } }}>
      <label>ابحث عن {noun}<input role="combobox" aria-autocomplete="list" aria-expanded={open && !!text.trim()} aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        placeholder={kind === "category" ? "اكتب اسم القسم…" : "اكتب اسم المنتج أو الكود…"} maxLength={100} autoComplete="off" value={text}
        required onFocus={() => { if (text.trim() && !selected) { setOpen(true); setStatus("جارٍ البحث…"); } }}
        onChange={event => { generation.current++; setText(event.target.value); setSelected(""); setItems([]); setActive(-1); setOpen(true); setStatus("جارٍ البحث…"); }}
        onKeyDown={event => {
          if (event.key === "Escape") { generation.current++; setOpen(false); }
          else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault(); setOpen(true);
            if (items.length) setActive(previous => event.key === "ArrowDown" ? (previous + 1) % items.length : previous <= 0 ? items.length - 1 : previous - 1);
          } else if (event.key === "Enter" && open) { event.preventDefault(); if (items[active]) choose(items[active]); }
        }} /></label>
      {open && !!text.trim() && <div className="search-suggestions"><ul role="listbox" id={listId} aria-label={`نتائج بحث ${noun}`}>
        {items.map((item, index) => <li role="option" id={`${listId}-${index}`} aria-selected={active === index} key={item.id} onPointerDown={event => event.preventDefault()} onClick={() => choose(item)}><span>{item.label}</span><small>{item.detail}</small></li>)}
      </ul><p role="status">{status}</p></div>}
      {selected && <p className="field-hint">تم اختيار: {text}</p>}
      {!selected && text && !open && <p className="field-hint">اختار نتيجة البحث لتأكيد {noun}.</p>}
    </div>}
  </div>;
}
