const labels=["النهارده","بكرة","بعد بكرة"];
export function deliveryChoices(now=new Date()){
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
 const part=(type:string)=>Number(parts.find(p=>p.type===type)!.value);
 return labels.map((label,offset)=>({label,date:new Date(Date.UTC(part("year"),part("month")-1,part("day")+offset,12)).toISOString().slice(0,10)}));
}
export function formatDeliveryDate(date:string|null|undefined){return date?new Intl.DateTimeFormat("ar-EG",{timeZone:"UTC",weekday:"long",year:"numeric",month:"long",day:"numeric"}).format(new Date(`${date}T12:00:00Z`)):"لم تحدد الإدارة موعد التوصيل بعد";}
