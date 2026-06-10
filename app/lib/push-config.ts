// Web Push 的 VAPID 公钥（公开，可提交；私钥只放在 GitHub Secret 里发推用）。
// 如需轮换密钥：用 `node -e 'console.log(require("web-push").generateVAPIDKeys())'` 重新生成，
// 更新此处公钥 + GitHub Secret 的 VAPID_PRIVATE_KEY/VAPID_PUBLIC_KEY，老订阅需重新订阅。
export const VAPID_PUBLIC_KEY =
  'BINdwO7QIlP6vpC_Xdbbacd3PzBXcVpMPG_CAb-9RQVnEGSg-NGhEx1X_LULCXr3MSFma0YrrLT_tAWN29sytZc';
