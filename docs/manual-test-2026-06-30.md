# 手工兼容性矩阵

日期：2026-06-30
状态：待执行，当前环境无法完成跨版本 / 跨平台人工验收

## 阻塞说明

- 当前工作环境未提供 Windows 环境。
- 当前工作环境未提供 Chrome previous stable。
- 因此本文件先记录 release gate 所需矩阵与当前状态，正式发布前必须补齐。

## 结果记录

| 场景 | Chrome 版本 | OS | 结果 | 说明 |
|---|---|---|---|---|
| Light theme / 100% zoom / News article | 未执行 | 未执行 | Blocked | 待当前 Chrome stable 手工验证 |
| Dark theme / 125% zoom / Blog page | 未执行 | 未执行 | Blocked | 待当前 Chrome stable 手工验证 |
| Light theme / 150% zoom / Documentation page | 未执行 | 未执行 | Blocked | 待当前 Chrome stable 手工验证 |
| Nested elements | 未执行 | 未执行 | Blocked | 待当前 Chrome stable 手工验证 |
| iframe | 未执行 | 未执行 | Blocked | 待当前 Chrome stable 手工验证 |
| Dynamically inserted paragraph | 未执行 | 未执行 | Blocked | 待当前 Chrome stable 手工验证 |
| English system voice present | 未执行 | 未执行 | Blocked | 待当前 Chrome stable 手工验证 |
| English system voice absent | 未执行 | 未执行 | Blocked | 需专门环境验证 |
| Chrome closed across scheduled time, then reopened | 未执行 | 未执行 | Blocked | 需时间触发场景验证 |
| Host permission revoked after registration | 未执行 | 未执行 | Blocked | 待当前 Chrome stable 手工验证 |
| Previous stable on macOS | 未执行 | macOS | Blocked | 当前环境未提供 previous stable |
| Current stable on Windows | 未执行 | Windows | Blocked | 当前环境未提供 Windows |
| Previous stable on Windows | 未执行 | Windows | Blocked | 当前环境未提供 Windows 与 previous stable |
