"use strict";
const fs=require("node:fs");
const {gzipSync}=require("node:zlib");
const {createSectionFixture,createSectionFetch}=require("./account-section-fixture.cjs");
const {readOrderStaffView}=require("./orders-staff-view.cjs");
const fixture=createSectionFixture();
const read=createSectionFetch(fixture,[],()=>({calendarBatch:true,primaryError:{status:404,
  body:{code:"PGRST205",message:"Could not find the table public.admin_staff_assignments"}}}));
module.exports=async(url,options)=>{
  const u=new URL(url);
  const response=u.pathname.endsWith("/admin_order_staff_list_entries") ? readOrderStaffView(fixture.rows,u) : await read(url,options);
  const body=await response.text();
  fs.appendFileSync(process.env.SERIES_TRAFFIC_CAPTURE,JSON.stringify({table:u.pathname.split("/").at(-1),kind:u.searchParams.get("kind"),method:options?.method||"GET",
    bytes:Buffer.byteLength(body),gzipBytes:gzipSync(body).length})+"\n");
  return response;
};
