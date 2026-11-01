import {spawnSync} from "node:child_process";
import {randomUUID} from "node:crypto";
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
if(!url||!["localhost","127.0.0.1"].includes(new URL(url).hostname))throw new Error("Local development benchmark only.");
const category=randomUUID(),marker=randomUUID().slice(0,8).toUpperCase();
// All data and audit rows roll back in the SAME database connection. There is no
// reset, deletion of existing records, or persistent benchmark records; products use the normal available=true default.
const sql=`
begin;
set local statement_timeout='120s';
${process.env.CATALOG_BENCH_JIT==="off"?"set local jit=off;":""}
insert into public.categories(id,name,active) values('${category}','اختبار سعة ${marker}',true);
insert into public.products(sku,name,category_id,active)
select 'BENCH-${marker}-'||lpad(n::text,5,'0'),'منتج اختبار سعة '||n,'${category}',true from generate_series(1,10000) n;
insert into public.product_units(product_id,name,pieces_per_unit,price_piastres,minimum_quantity,active)
select id,'كرتونة',12,10000,1,true from public.products where category_id='${category}';
create temporary table bench_times(kind text,ms numeric) on commit drop;
do $bench$ declare started timestamptz;iteration integer;begin
for iteration in 1..50 loop
started:=clock_timestamp();perform 1 from public.browse_catalog('',null,25,'${category}','sku',false);insert into bench_times values('category_first_page',extract(epoch from clock_timestamp()-started)*1000);
started:=clock_timestamp();perform 1 from public.browse_catalog('BENCH-${marker}-05000',null,25,'${category}','sku',false);insert into bench_times values('exact_sku_search',extract(epoch from clock_timestamp()-started)*1000);
started:=clock_timestamp();perform 1 from public.browse_catalog('منتج اختبار سعة',null,25,'${category}','name',true);insert into bench_times values('arabic_available_search',extract(epoch from clock_timestamp()-started)*1000);
end loop;end $bench$;
select json_build_object('fictional_products',10000,'fictional_units',10000,'queries',150,'results',(select json_agg(t) from(select kind,round(avg(ms),2) average_ms,round(max(ms),2) maximum_ms,round(percentile_cont(0.95) within group(order by ms)::numeric,2) p95_ms from bench_times group by kind order by kind)t));
rollback;
`;
const result=spawnSync("docker",["exec","-i","supabase_db_al-ferdous-wholesale","psql","-U","postgres","-d","postgres","-qAt","-v","ON_ERROR_STOP=1"],{input:sql,encoding:"utf8",timeout:180000,windowsHide:true});
if(result.status!==0){console.error("Local benchmark failed; the database connection rolls back its transaction.");console.error(String(result.stderr||result.error?.message||"").slice(0,1200));process.exitCode=1;}
else {const metrics=JSON.parse(result.stdout.trim());console.log(JSON.stringify(metrics));console.log("Benchmark transaction rolled back. No capacity guarantee: this is a warm, serial database smoke test, not an HTTP load test.");}
