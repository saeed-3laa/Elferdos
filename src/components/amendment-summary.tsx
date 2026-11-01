import {formatEgp} from "@/domain/money";
import type {AmendmentQuote} from "@/domain/orders";
export function AmendmentSummary({quote}:{quote:Pick<AmendmentQuote,"changes">&{before:{total:number};after:{total:number;delivery_fee:number}}}){
 const number=new Intl.NumberFormat("ar-EG");
 return <div className="amendment-summary"><div className="table-scroll"><table className="admin-table"><thead><tr><th>الصنف</th><th>قبل التعديل</th><th>بعد التعديل</th></tr></thead><tbody>{quote.changes.map(change=><tr key={change.unit_id}><td>{change.name}<small> — {change.unit}</small></td><td>{number.format(change.before)}</td><td>{change.after===0?<strong>تم حذف الصنف</strong>:number.format(change.after)}</td></tr>)}</tbody></table></div><dl><div><dt>الإجمالي قبل التعديل</dt><dd>{formatEgp(quote.before.total)}</dd></div>{quote.after.delivery_fee>0&&<div><dt>توصيل مسجل سابقًا</dt><dd>{formatEgp(quote.after.delivery_fee)}</dd></div>}<div><dt>الإجمالي الجديد</dt><dd>{formatEgp(quote.after.total)}</dd></div></dl></div>;
}
