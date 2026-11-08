'use client';let cache:Promise<{apiUrl:string;poolId:string;clientId:string}>|undefined;export function config(){cache??=fetch('/api/config',{cache:'no-store'}).then(r=>r.json());return cache}
