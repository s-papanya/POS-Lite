type Target={accountId:string;channel:"CASH" | "TRANSFER";amount:string};
export function reconciliationPreview(revision:string,targets:Target[],recorded:Target[]) {
  const lines=targets.map(t=>{
    const amount=recorded.find(r=>r.accountId===t.accountId && r.channel===t.channel)?.amount ?? "0";
    const delta=BigInt(t.amount)-BigInt(amount);
    return {accountId:t.accountId,channel:t.channel,recorded:amount,target:t.amount,delta:String(delta),requiresReview:delta<0n};
  });
  return {revision,lines,netSales:String(recorded.reduce((sum,r)=>sum+BigInt(r.amount),0n)+lines.reduce((sum,l)=>sum+BigInt(l.delta),0n)),
    accountEffects:lines.some(l=>l.requiresReview) ? [] : lines.filter(l=>BigInt(l.delta)>0n).map(l=>({accountId:l.accountId,delta:l.delta}))};
}
