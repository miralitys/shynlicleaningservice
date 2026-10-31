"use strict";

// Independent model of the SQL projection, using the legacy JavaScript fallbacks.
function projectOrderStaffRow(row) {
  const staff = row.kind === "admin_staff_member";
  const source = row.payload_for_retry?.[staff ? "staff" : "assignment"] || {};
  const fields = staff ? { id:"id",name:"customer_name",role:"service_name",address:"full_address",status:"code",
    createdAt:"created_at",updatedAt:"updated_at" } : { entryId:"request_id",staffIds:"warnings",
    scheduleDate:"selected_date",scheduleTime:"selected_time",status:"code",notes:"error_message",
    createdAt:"created_at",updatedAt:"updated_at" };
  const list_record = Object.fromEntries(Object.entries(fields).map(([key,fallback]) => [key,(source[key] || row[fallback]) ?? null]));
  if (!staff) list_record.travelEstimates = source.travelEstimates ?? null;
  return { id:row.id,kind:row.kind,list_record };
}

function readOrderStaffView(rows, url, cap=1000) {
  const u = new URL(url);
  const matched = rows.filter(row => `eq.${row.kind}` === u.searchParams.get("kind") &&
    (!u.searchParams.has("id") || row.id > u.searchParams.get("id").slice(3))).sort((a,b)=>a.id.localeCompare(b.id));
  const body = matched.slice(0, Math.min(cap,Number(u.searchParams.get("limit") || 1000))).map(projectOrderStaffRow);
  return { ok:true,status:200,text:async()=>JSON.stringify(body),
    headers:{get:name=>name.toLowerCase()==="content-range" ? `0-${Math.max(0,body.length-1)}/${matched.length}` : null} };
}
module.exports = { projectOrderStaffRow,readOrderStaffView };
