// const fs = require('fs')
const rp = require('request-promise-native')
// const schedule = require('node-schedule')

const rws = require('../utils/rws')
// const athome = require('./athome')
const LiveWS = require('bilibili-live-ws')
const nameConv = require('../utils/nameConv')
const onLive = require('../utils/onLive')

const events = require('events')
const emitter = new events.EventEmitter()

const schList = {}
const tsList = {}

let exRate = 14.7

const log = process.env.NODE_ENV == 'development' ? console.log : () => {}

const rdbCore = (rid) => {
  if (!global.predb) return
  const predb = global.predb
  if (!global.utrdb) return
  const utrdb = global.utrdb
  if (!tsList[rid]) {
    tsList[rid] = new Date().getTime()
  }
  log(`LOG start rdb room ${rid}`)
  const ws = new LiveWS(rid)
  ws.on('msg', async (data) => {
    try {
      switch (data.cmd) {
        case 'GUARD_BUY':
          {
            const uname = data.data.username
            let unamejpn = ''
            const unameFinded = await utrdb
              .find({ uname })
              .limit(1)
              .toArray()
            if (
              unameFinded.length > 0 &&
              unameFinded[0].unamejpn &&
              unameFinded[0].unamejpn !== ''
            ) {
              unamejpn = unameFinded[0].unamejpn
            } else {
              try {
                unamejpn = await nameConv(uname)
                if (unameFinded.length > 0) {
                  await utrdb.updateOne({ uname }, { $set: { unamejpn } })
                } else {
                  await utrdb.insertOne({ uname, unamejpn })
                }
              } catch (e) {
                console.log('ERR at fetching uname ' + uname)
                console.log(e)
              }
            }
            try {
              let avatar = 'https://static.hdslb.com/images/member/noface.gif'
              try {
                const avatard = JSON.parse(
                  await rp(
                    'https://api.bilibili.com/x/space/acc/info?mid=' +
                      data.data.uid
                  )
                )
                if (Number(avatard.code) == 0) avatar = avatard.data.face
                else
                  console.log(
                    'ERR when fetching face of uid ' +
                      data.data.uid +
                      ' by code != 0'
                  )
              } catch (e) {
                console.log(
                  'ERR when fetching face of uid ' + data.data.uid + ' by catch'
                )
                console.log(e)
              }
              await predb.insertOne({
                roomid: Number(rid),
                livets: Number(tsList[rid]),
                ts: Number(new Date().getTime()),
                uname,
                unamejpn,
                avatar,
                price: Number(Number(data.data.price) / 1000),
                exrate: Number(exRate),
                hide: 0,
                type: Number(data.data.guard_level)
              })
            } catch (e) {
              console.log('ERR when writing data: ')
              console.log(data)
              console.log(e)
            }
          }
          break
        case 'SEND_GIFT':
          {
            if (data.data.coin_type != 'gold') break
            const uname = data.data.uname
            let unamejpn = ''
            const unameFinded = await utrdb
              .find({ uname })
              .limit(1)
              .toArray()
            if (
              unameFinded.length > 0 &&
              unameFinded[0].unamejpn &&
              unameFinded[0].unamejpn !== ''
            ) {
              unamejpn = unameFinded[0].unamejpn
            } else {
              try {
                unamejpn = await nameConv(uname)
                if (unameFinded.length > 0) {
                  await utrdb.updateOne({ uname }, { $set: { unamejpn } })
                } else {
                  await utrdb.insertOne({ uname, unamejpn })
                }
              } catch (e) {
                console.log('ERR at fetching uname ' + uname)
                console.log(e)
              }
            }
            try {
              await predb.insertOne({
                roomid: Number(rid),
                livets: Number(tsList[rid]),
                ts: Number(new Date().getTime()),
                uname,
                unamejpn,
                avatar: data.data.face,
                price: Number(Number(data.data.price) / 1000),
                exrate: Number(exRate),
                hide: 0,
                type: 4,
                gift: data.data.giftName
              })
            } catch (e) {
              console.log('ERR when writing data: ')
              console.log(data)
              console.log(e)
            }
          }
          break
        default:
          break
      }
    } catch (e) {
      console.log('ERR when rp room ' + rid)
      console.log(e)
    }
  })
  return ws
}

const rdbClose = async (rid) => {
  if (!schList[rid]) return
  schList[rid].close()
  schList[rid] = false
  tsList[rid] = false
}

module.exports = async function() {
  rws(emitter)
  try {
    for (const item of await onLive()) {
      schList[Number(item)] = rdbCore(Number(item))
    }
  } catch (e) {
    console.log('ERR when fetch onLive')
    console.log(e)
  }
  exRate = Number(
    JSON.parse(
      await rp('https://api.live.bilibili.com/userext/v1/Conf/getExchangeRate')
    ).data.exchange_rate
  )
  emitter.on('LIVE', (data) => {
    schList[Number(data.roomid)] = rdbCore(Number(data.roomid))
  })
  emitter.on('PREPARING', async (data) => {
    await rdbClose(Number(data.roomid))
  })
}
