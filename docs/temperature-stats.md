# 溫度統計規則

## 概述

機台每分鐘回報一筆原始溫度（`tempreports` collection），由 Node-RED projector 即時降採樣寫入三個 bucket collection，供前端以不同時間尺度查詢。

## 三層 Bucket

| 尺度 | Collection | 粒度 | 總筆數上限 | 預設顯示（sliding window 25%） | TTL 保留 |
|------|------------|------|-----------|-------------------------------|----------|
| 本日 | `temp_5min` | 每 5 分鐘 | 288 筆 | 72 筆 (~6 小時) | 2 天 |
| 本週 | `temp_30min` | 每 30 分鐘 | 336 筆 | 84 筆 (~1.75 天) | 8 天 |
| 本月 | `temp_2hr` | 每 2 小時 | 360 筆 | 90 筆 (~7.5 天) | 31 天 |

## Document Schema

```json
{
  "deviceId": "8c147dd48d16",
  "bucket": "2026-02-27T14:30",
  "sumTemp": 26.0,
  "count": 5,
  "avgTemp": 5.2,
  "minTemp": 4.8,
  "maxTemp": 5.6,
  "updatedAt": "2026-02-27T14:34:41Z"
}
```

| 欄位 | 說明 |
|------|------|
| `deviceId` | 機台 HID，與 `bucket` 組成 upsert key（unique index） |
| `bucket` | 時間桶標識（Asia/Taipei 時區），截到粒度起點。例如 14:33 → `14:30`（5min）、`14:00`（30min）、`14:00`（2hr） |
| `sumTemp` | 桶內溫度加總，用於增量計算平均 |
| `count` | 桶內累計原始資料筆數 |
| `avgTemp` | 平均溫度 = `sumTemp / count`，後端計算，前端直接使用 |
| `minTemp` | 桶內最低溫 |
| `maxTemp` | 桶內最高溫 |
| `updatedAt` | 最後更新時間，也作為 TTL index 的清除依據 |

## 寫入機制（Node-RED Projector）

每筆 tempreport 進來時，projector 同時 upsert 三個 bucket collection，使用 MongoDB aggregation pipeline update：

```js
updateOne(
  { deviceId, bucket },
  [
    { $set: {
        sumTemp:   { $add: [{ $ifNull: ['$sumTemp', 0] }, temp] },
        count:     { $add: [{ $ifNull: ['$count', 0] }, 1] },
        minTemp:   { $min: [{ $ifNull: ['$minTemp', temp] }, temp] },
        maxTemp:   { $max: [{ $ifNull: ['$maxTemp', temp] }, temp] },
        updatedAt: receivedAt
    }},
    { $set: {
        avgTemp: { $round: [{ $divide: ['$sumTemp', '$count'] }, 1] }
    }}
  ],
  { upsert: true }
)
```

即時寫入，不需排程。

## TTL 自動清除

MongoDB TTL index 每 60 秒掃描，自動刪除超過保留時長的 document：

| Collection | TTL index 欄位 | `expireAfterSeconds` |
|------------|---------------|---------------------|
| `tempreports` | `receivedAt` | 2,678,400（31 天） |
| `temp_5min` | `updatedAt` | 172,800（2 天） |
| `temp_30min` | `updatedAt` | 691,200（8 天） |
| `temp_2hr` | `updatedAt` | 2,678,400（31 天） |

## 查詢（GraphQL）

```graphql
query($deviceId: String!, $scale: String!) {
  tempBuckets(deviceId: $deviceId, scale: $scale) {
    bucket avgTemp minTemp maxTemp count
  }
}
```

`scale` 參數：`day` | `week` | `month`

## 前端顯示

- 圖表折線：`avgTemp`
- 半透明藍色區域帶：`minTemp` ↔ `maxTemp` 範圍
- Tooltip：平均、最低▼、最高▲、原始資料筆數
- Sliding window：預設顯示最近 25%，bucket 數不足 72 筆時顯示全部
- 粒度圖例說明：`每 5 分鐘平均` / `每 30 分鐘平均` / `每 2 小時平均`

## 設計原則

1. 溫度統計紀錄最多只保留一個月內
2. 三個尺度各自保持在 ~300 筆以內的筆數規模
3. 避免後端數據容量問題，以及前端傳輸及 render 效能問題
