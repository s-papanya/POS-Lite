type Discount = {kind:"FIXED";amount:string} | {kind:"PERCENT";basisPoints:number};
export function calculateSale(items:{unitPrice:string;quantity:number}[],discount:Discount,payments:string[]) {
  const lines=items.map((item)=>BigInt(item.unitPrice)*BigInt(item.quantity));
  const gross=lines.reduce((sum,line)=>sum+line,0n);
  const reduction=discount.kind==="FIXED" ? BigInt(discount.amount) : (gross*BigInt(discount.basisPoints)+5000n)/10000n;
  const net=gross-reduction;
  if(gross>9000000000000n || net<=0n || reduction>gross || payments.reduce((sum,p)=>sum+BigInt(p),0n)!==net) return;
  return {gross:String(gross),discount:String(reduction),net:String(net),lineTotals:lines.map(String)};
}
