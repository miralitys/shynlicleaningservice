"use strict";

const Module=require("node:module");
const path=require("node:path");
const {execFileSync}=require("node:child_process");
const root=path.resolve(__dirname,"../..");
const files=new Set(["lib/admin-staff-store.js","lib/supabase-admin-staff.js","lib/admin/pages/orders-page.js","lib/admin/domain-orders.js"]);
const previous=Module._extensions[".js"];
Module._extensions[".js"]=function(module,filename){
  const relative=path.relative(root,filename);
  if(process.env.ADMIN_READ_BASELINE_REF&&files.has(relative)){
    const source=execFileSync("git",["show",`${process.env.ADMIN_READ_BASELINE_REF}:${relative}`],{cwd:root,encoding:"utf8"});
    return module._compile(source,filename);
  }
  return previous(module,filename);
};
