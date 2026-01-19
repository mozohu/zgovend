# zgovend

本專案為智購販賣機平台的 AI 發展區，集中管理規格、文件、程式碼、測試資料與執行環境，支援快速迭代與外包協作。

## 撰寫規範
- 對人閱讀的內容請使用繁體中文。
- 程式碼變數與檔案名稱使用英文。
- 所有檔案名稱以英文為主。
- 程式碼註解使用中文。

## 目錄結構
- `docs/` 規格與設計文件
  - `docs/requirements/` 需求彙整、訪談紀錄、SOW
  - `docs/architecture/` 架構圖與系統邊界
  - `docs/api/` API 合約與範例
  - `docs/flows/` 角色流程與介面互動流程
  - `docs/decisions/` 架構決策紀錄（ADR）
- `specs/` 規格草稿與定稿
  - `specs/drafts/` 規格草稿與討論稿
  - `specs/final/` 定稿規格
- `src/` 程式碼
  - `src/liff/` LINE LIFF 前端
  - `src/bot/` LINE Bot 訊息處理與流程
  - `src/api/` 後端/API 層
  - `src/shared/` 共用模組
- `test/` 測試相關
  - `test/data/` 測試資料（JSON/CSV/SQL）
  - `test/cases/` 測試案例
  - `test/mocks/` Mock API 與 fixtures
  - `test/reports/` 測試輸出
- `env/` 執行與測試環境
  - `env/docker/` Dockerfile 與 compose
  - `env/scripts/` 啟動與初始化腳本
  - `env/configs/` 範例設定檔
- `tools/` 工具腳本與資料轉換
- `assets/` 圖片、流程圖原檔與素材
- `notes/` 會議紀錄與討論摘要
