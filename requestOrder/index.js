// 云函数入口文件
const cloud = require('wx-server-sdk')
const crypto = require("crypto")
const fs = require("fs")
const urllib = require('urllib')

cloud.init()

const MCH_ID = "你的商户号"
const SERIAL_NO = "你的证书序列号"
//获取证书序列号 https://pay.weixin.qq.com/wiki/doc/apiv3/wechatpay/wechatpay7_0.shtml#part-5

const NOTIFY_URL = "你的NOTIFY_URL"


// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  let {fee = 100} = event
  const {APPID, OPENID} = wxContext

  let outTradeNo = getTradeNo()
  let description = "商品名称请填入这里"

  let orderData = await unifiedOrder({appid: APPID, openid: OPENID, description, outTradeNo, fee})
  
  console.log("orderData: ", orderData)
  if(!orderData || !orderData.prepay_id) {
    return {errMsg: "没有 prepay_id"}
  } 

  let package = "prepay_id=" + orderData.prepay_id
  let timeStamp = Date.now() / 1000 | 0
  let nonceStr = getNonce()
  let paySign = getPaySign({appid: APPID, timeStamp, nonceStr, package})
  console.log("paySign: ", paySign)

  let unifiedOrderRes = {
    appId: APPID,
    timeStamp: "" + timeStamp,
    nonceStr,
    package,
    signType: "RSA",
    paySign,
  }

  return {payment: unifiedOrderRes}
}

function getNonce(len = 32) {
  let str = ""
  const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  for(let i=0; i<len; i++) {
     str += ABC[Math.floor(Math.random() * ABC.length)]
  }
  return str
}

function getTradeNo() {
  let now = Date.now()
  return String(now) + "_" + getNonce(6)
}

async function unifiedOrder({appid, openid, description, outTradeNo, fee} = {}) {
  let params = {
    appid, appid,
    mchid: MCH_ID,
    description,
    out_trade_no: outTradeNo,
    notify_url: NOTIFY_URL,
    amount: {
      total: fee,
    },
    payer: {openid},
  }

  let authHeader = getRequestAuthorization({body: params, path: "/v3/pay/transactions/jsapi"})

  console.log("authHeader: ", authHeader)
  let opt = {
    method: "POST",
    headers: {
      "Authorization": authHeader,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "LemonSJTU/wx-mini",
    },
    data: params,
  }
  let url = "https://api.mch.weixin.qq.com/v3/pay/transactions/jsapi"
  console.log("发起网络请求......")
  let {status, data} = await urllib.request(url, opt)
  let dataStr = data.toString()
  console.log("status: ", status)
  console.log("data.toString(): ", dataStr)
  return JSON.parse(dataStr)
}


function getPaySign({appid, timeStamp, nonceStr, package} = {}) {
  let message = appid + "\n" + timeStamp + "\n" + nonceStr + "\n" + package + "\n"
  const PRIVATE_KEY = fs.readFileSync("./certKey/apiclient_key.pem").toString()
  let signature = crypto.createSign("sha256WithRSAEncryption").update(message).sign(PRIVATE_KEY, 'base64')
  return signature
}

function getRequestAuthorization({method = "POST", body, path} = {}) {
  let timeStamp = Date.now() / 1000 | 0
  let nonce = getNonce()
  let b2 = typeof body === 'object' ? JSON.stringify(body) : body
  let message = "" + method + "\n" + path + "\n" + timeStamp + "\n" + nonce + "\n"
  if(b2) message += (b2 + "\n")
  const PRIVATE_KEY = fs.readFileSync("./certKey/apiclient_key.pem").toString()
  let signature = crypto.createSign("sha256WithRSAEncryption").update(message).sign(PRIVATE_KEY, 'base64')
  let reqAuth = 'WECHATPAY2-SHA256-RSA2048 mchid="' + MCH_ID + '",nonce_str="' + nonce + '",signature="' + signature + '",timestamp="' + timeStamp + '",serial_no="' + SERIAL_NO + '"'
  console.log("看一下 reqAuth: ", reqAuth)
  return reqAuth
}