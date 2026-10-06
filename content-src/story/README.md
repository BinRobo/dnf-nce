# 剧本时长估算

估算规则：say/narr/item 每步 3 秒（带原声的 say 取 audio 的 end-start）；enter/exit/fx 每步 1 秒；sfx 0 秒。
校验：`node content-src/story/validate.mjs`

| id | 步数 | 估算时长 | 上限 |
|---|---|---|---|
| prologue | 23（含 enter/exit/fx/sfx 共 7 步非对白） | 56.6 秒 | 90 秒 |
| L001_intro | 4 | 10.0 秒 | 15 秒 |
| L001_boss | 1 | 1.6 秒 | 3 秒 |
| L001_clear | 3 | 7.2 秒 | 10 秒 |
| L005_intro | 4 | 11.3 秒 | 15 秒 |
| L005_boss | 1 | 3.0 秒 | 3 秒 |
| L005_clear | 4 | 9.4 秒 | 10 秒 |
| town_blake | 3 | 8.2 秒 | 2–3 句 |
| town_sophie | 3 | 8.2 秒  | 2–3 句 |
| quest_L001_give | 4 | 10.0 秒 | 15 |
| quest_L001_done | 6 | 16.0 秒 | 20 |
| quest_L005_done | 5 | 10.6 秒 | 20 |
| room_L001 | 4 | 10.0 秒 | 12 |
| room_L005 | 3 | 9.0 秒 | 12 |
| boss_L001_p2 | 2 | 4.6 秒 | 4（两步，略超） |
| boss_L001_p3 | 1 | 3.0 秒 | 4 |
| boss_L005_p2 | 2 | 6.0 秒 | 4（两步，略超） |
| boss_L005_p3 | 1 | 3.0 秒 | 4 |
| L005_duke | 8 | 20.0 秒 | 20 |
| tut_start | 3 | 9.0 秒 | 10 |
| tut_wrong | 2 | 6.0 秒 | 6 |
| tut_spell | 2 | 6.0 秒 | 6 |
| tut_awaken | 2 | 6.0 秒 | 6 |
| tut_exit | 2 | 6.0 秒 | 6 |
| shop_woman | 3 | 9.2 秒 | 10 |

备注：town_sophie 的 "Nice to meet you." 原声是 Hans 的声音（课文中 Sophie 无此句）；L001_intro 末句由 hero 说 "Is this your handbag?"（原声为课文中的 Man）。

第 2 轮新增：step 类型 quest（1 秒）、who 值 duke；town_sophie 改为指向“当前目标”。boss_*_p2 两步因每句计 3 秒略超 4 秒。
