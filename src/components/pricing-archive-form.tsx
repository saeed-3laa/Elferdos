"use client";

import { useActionState } from "react";
import { archivePricingRule } from "@/app/admin/pricing/actions";

export function PricingArchiveForm({ id, revision, archived }: { id: string; revision: number; archived: boolean }) {
  const [state, action, pending] = useActionState(archivePricingRule, {});
  return <form action={action}>
    <input type="hidden" name="id" value={id} />
    <input type="hidden" name="revision" value={revision} />
    <input type="hidden" name="archived" value={String(!archived)} />
    <button type="submit" className="button button-secondary" disabled={pending}>
      {pending ? "جارٍ الحفظ…" : archived ? "استرجاع العرض" : "أرشفة العرض"}
    </button>
    {state.error && <p role="alert" className="form-error">{state.error}</p>}
    {state.success && <p role="status">{state.success}</p>}
  </form>;
}
