"use strict";
const fs=require("node:fs");
const {gzipSync}=require("node:zlib");
const {createSectionFixture,createSectionFetch}=require("./account-section-fixture.cjs");
const {readOrderStaffView}=require("./orders-staff-view.cjs");
const fixture=createSectionFixture();
if(process.env.ORDERS_STAFF_TRAVEL_FIXTURE==="1")for(const row of fixture.rows.filter(r=>r.kind==="admin_staff_assignment")){
  const assignment=row.payload_for_retry.assignment;
  assignment.travelEstimates=(assignment.staffIds||[]).map((staffId,index)=>({staffId,staffName:`QA cleaner ${index}`,
    originAddress:`${index+1} QA origin road`,destinationAddress:`${assignment.entryId} QA destination street`,
    sourceType:"home",sourceLabel:"Home",departureTimestamp:1888225200000,status:"ok",durationSeconds:901+index,
    distanceMeters:3010+index,durationText:"20 min",distanceText:"2 mi",label:"20 min",error:"",calculatedAt:"2026-10-01T12:00:00.000Z"}));
}
const read=createSectionFetch(fixture,[],()=>({calendarBatch:true,primaryError:{status:404,
  body:{code:"PGRST205",message:"Could not find the table public.admin_staff_assignments"}}}));
module.exports=async(url,options)=>{
  const u=new URL(url);
  const response=u.pathname.endsWith("/admin_order_staff_list_entries") ? readOrderStaffView(fixture.rows,u) : await read(url,options);
  const body=await response.text();
  fs.appendFileSync(process.env.SERIES_TRAFFIC_CAPTURE,JSON.stringify({table:u.pathname.split("/").at(-1),kind:u.searchParams.get("kind"),select:u.searchParams.get("select"),method:options?.method||"GET",
    bytes:Buffer.byteLength(body),gzipBytes:gzipSync(body).length})+"\n");
  return response;
};
