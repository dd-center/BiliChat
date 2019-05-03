import { Injectable } from '@angular/core';
import { IMessage, DanmakuMessage, GiftMessage } from './danmaku.def';
import { Observable, race, timer, fromEvent, Subscriber, of } from 'rxjs';
import { map, mergeMap, mapTo } from 'rxjs/operators';
import { environment } from '../environments/environment';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class MessageProcessorService {

  userLevelFilter = 0;

  minGiftValue = 20;

  showGift = true;

  hideGiftDanmaku = true;

  // showMember:boolean;

  // showModerator:boolean;

  loadAvatar = true;

  groupSimilar = true;

  wordFilter: Array<string> = [
    'kimo', '风暴',
    '弹幕姬', '弹幕机',
    '别刷', '不要刷',
    '小鬼', 'biss',
    '嘴臭', '骂我',
    '梗',
    '傻逼', '弱智', '脑残', '屏蔽', 'cnm',
    '警察', '加群', '群号', 'QQ群', '出警',
    '人工智能', '老婆'
  ];

  constructor(private http: HttpClient) { }

  lastDanmakuMessage: DanmakuMessage;

  formMessage(rawData: any, observer: Subscriber<IMessage>) {
    if (rawData.cmd === 'DANMU_MSG') {
      if (this.hideGiftDanmaku && rawData.info[0][9] > 0) {
        return; // 屏蔽礼物弹幕
      }
      if (this.userLevelFilter > rawData.info[4][0] && rawData.info[2][2] === 0 && rawData.info[7] === 0) {
        return; // 用户等级屏蔽
      }
      const content = String(rawData.info[1]);
      if (this.wordFilter.some((item) => {
        return content.indexOf(item) !== -1;
      })) {
        return; // 关键字屏蔽
      }
      if (this.groupSimilar
        && this.lastDanmakuMessage != null
        && (this.lastDanmakuMessage.message.indexOf(content) !== -1 || content.indexOf(this.lastDanmakuMessage.message) !== -1)
      ) {
        this.lastDanmakuMessage.repeat++;
        return;
      }
      this.avatarPreload(rawData.info[2][0]).subscribe(
        avatarUrl => {
          let l = new DanmakuMessage(
            rawData.info[2][0],
            rawData.info[2][1],
            rawData.info[1],
            rawData.info[7],
            rawData.info[2][2] === 1,
            avatarUrl
          )
          this.lastDanmakuMessage=l;
          observer.next(l);
        }
      );
    } else if (this.showGift && rawData.cmd === 'SEND_GIFT') {
      if (rawData.data.coin_type !== 'gold') {// gold/silver
        return;
      }
      const value = rawData.data.total_coin;
      if (value < this.minGiftValue * 1000) {// 计算用的scale
        return;
      }

      this.avatarPreload(rawData.data.uid).subscribe(
        avatarUrl => {
          observer.next(new GiftMessage(
            rawData.data.uid,
            rawData.data.uname,
            rawData.data.giftName,
            rawData.data.num,
            value / 1000,
            0,
            avatarUrl
          ));
        }
      );
    } else if (rawData.cmd === 'GUARD_BUY') {
      this.avatarPreload(rawData.data.uid).subscribe(
        avatarUrl => {
          observer.next(new GiftMessage(
            rawData.data.uid,
            rawData.data.username,
            rawData.data.gift_name,
            rawData.data.num,
            rawData.data.price / 1000,
            rawData.data.guard_level,
            avatarUrl
          ));
        }
      );
    }
  }

  avatarPreload(userid: number): Observable<string> {
    if (!this.loadAvatar) {
      return of(environment.default_avatar);
    }
    let obs = this.http.get(`${environment.api_server}/avturl/${userid}`)
      .pipe(
        //mapTo(x=>x.json()),
        mergeMap((data: any) => {
          if (data.face == 'http://static.hdslb.com/images/member/noface.gif') {
            return of(environment.default_avatar);
          }
          data.face = (<string>data.face).replace(/http:/g, "https:");
          let img = new Image();
          img.src = data.face + '@48w_48h';
          return race(
            fromEvent(img, 'load').pipe(
              map(x => data.face + '@48w_48h')
            ),
            fromEvent(img, 'error').pipe(
              map(x => environment.default_avatar)
            )
          );
        }));

    return race(
      timer(1000).pipe(
        map(x => environment.default_avatar)
      ),
      obs
    );
  }

  getGuardName(level: number) {
    //i18n
    switch (level) {
      case 1:
        return '总督';
      case 2:
        return '提督';
      case 3:
        return '舰长';
      default:
        return null;
    }
  }
}

