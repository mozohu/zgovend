# Mock API 清單（草案）

基礎路徑：`/api/v1`

## 身分驗證
- `POST /auth/liff/login`（所有角色）
  - 以 LIFF token 交換後端 session
- `GET /auth/registration-status`
  - 查詢是否已完成註冊
- `POST /auth/oauth/register`
  - 以 OAuth 授權資訊完成註冊與綁定
- `GET /auth/permissions`
  - 取得角色與可用功能權限

## 客服問題（一般消費者）
- `POST /support/tickets`
  - 建立問題單（分類、描述、附件）
- `GET /support/tickets`
  - 查詢本人問題單清單與狀態
- `GET /support/tickets/{ticketId}`
  - 查詢問題單細節、處理過程與客服回覆內容（回覆由客服系統提供）

## 商品主檔（營運者）
- `GET /products`
  - 取得商品清單
- `POST /products`
  - 建立商品
- `PATCH /products/{productId}`
  - 更新商品欄位
- `DELETE /products/{productId}`
  - 硬刪除商品

## 機台管理（營運者）
- `GET /machines`
  - 取得機台清單（可篩選狀態/區域/類型）
- `GET /machines/{machineId}`
  - 取得機台詳情
- `POST /machines`
  - 新增機台
- `PATCH /machines/{machineId}`
  - 更新機台資料

## 營收與訂單（營運者）
- `GET /orders`
  - 訂單列表（可篩選狀態/支付方式/日期）
- `GET /orders/{orderId}`
  - 訂單詳情
- `GET /reports/revenue`
  - 營收/訂單彙總與圖表資料
- `POST /reports/revenue/export`
  - 匯出報表

## 庫存預約設定（營運者）
- `GET /preset-stock`
  - 取得設定檔清單
- `POST /preset-stock`
  - 建立空白設定檔
- `POST /preset-stock/{templateId}/copy-from-machine`
  - 由機台快照建立設定檔
- `POST /preset-stock/{templateId}/copy-from-template`
  - 由既有設定檔建立複本
- `PATCH /preset-stock/{templateId}`
  - 更名設定檔
- `DELETE /preset-stock/{templateId}`
  - 硬刪除設定檔
- `PUT /preset-stock/{templateId}/channels`
  - 更新貨道商品、滿倉量、庫存量

## 撿貨清單（巡補員）
- `POST /picklists`
  - 依選擇機台產生撿貨清單（總庫存量/總滿倉量/總缺補量）

## 巡補作業（巡補員）
- `POST /machines/{machineId}/checkin`
  - 現場簽到驗證
- `POST /replenishment/sessions`
  - 建立巡補 Session
- `GET /replenishment/templates`
  - 取得可用的預約設定清單
- `POST /replenishment/sessions/{sessionId}/apply-template`
  - 套用預約設定檔（暫存）
- `PATCH /replenishment/sessions/{sessionId}/channels`
  - 更新貨道商品/庫存/滿倉量（暫存，含清空/補滿）
- `POST /replenishment/sessions/{sessionId}/complete`
  - 提交巡補結果並寫入機台

## 機台同步（系統）
- `POST /machine-sync/inventory`
  - 同步機台庫存快照
- `POST /machine-sync/events`
  - 同步機台事件或狀態
