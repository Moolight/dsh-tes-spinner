# dsh-tes-spinner

一个常驻在 DSH Web 界面上的 **TES 陀螺挂件**：点一下就转，能拖到任意位置，带转速滑条和同步歌词。

不需要左侧面板入口 —— 它像宠物插件一样，直接浮在页面上。

## 功能

- **点击旋转** —— 沿用真实陀螺的物理：点一下给一记"抽打"冲量，转速按恒定摩擦**线性衰减**，转得越快停得越久
- **连点加速** —— 旋转中再点会叠加转速（方向锁定，不会互相抵消）
- **拖动定位** —— 拖到任意位置，**位置会被记住**（存 localStorage，刷新后回到原处）
- **转速滑条** —— 0.2× ~ 2.0× 实时调节，数值同样被记住
- **歌词同步** —— 读取同名 `.lrc` 文件，在陀螺上方单行显示，随播放进度滚动
- **音乐联动** —— 转动时播放音频，音量跟随转速；停下自动淡出并复位
- **优雅降级** —— 音频、歌词、图片任一缺失都不影响其他功能

## 安装

把整个目录放到 DSH profile 的 `node_modules` 下（或用 link 指向本目录），然后在 profile 的 `package.json` 里加上：

```json
{
  "dependencies": {
    "dsh-tes-spinner": "link:/path/to/dsh-tes-spinner"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "dsh-tes-spinner"
      ]
    }
  }
}
```

重启 DSH 生效。

## 使用

| 操作 | 效果 |
| --- | --- |
| 点陀螺 | 转起来（连点加速） |
| 拖陀螺 | 移动位置，松手记住 |
| 拖滑条 | 实时改转速 |
| 等待 | 转速衰减到 0 自动停止，音乐淡出 |

想复位位置，在浏览器控制台执行：

```js
localStorage.removeItem('dsh-tes-spinner-pos')
```

## 目录结构

```
dsh-tes-spinner/
├─ lib/
│  ├─ index.js        宿主侧:注册静态资源路由(public/ 走这里)
│  └─ client.js       浏览器侧:陀螺组件、歌词解析、挂载逻辑
├─ public/
│  ├─ tes-gyro.png    陀螺图形
│  ├─ sudden-spinner.mp3   音频
│  └─ sudden-spinner.lrc   歌词
├─ cordis.patch.yml   插件注册补丁
└─ package.json
```

## 开发说明

**本项目没有构建步骤。** `lib/` 下的文件就是源码本身（手写 JS），改完直接重启 DSH 生效。

之所以不用 TypeScript 编译链：DSH 加载的就是 `lib/index.js` 和 `lib/client.js` 这两个 ESM 文件，而最初的 `src/*.ts` 与最终实现已经严重脱节（形态从侧边栏面板改成了常驻浮层），保留两套互相矛盾的"源码"只会误导人，所以移除了。

两个文件的分工：

- `lib/index.js` —— 宿主侧。唯一职责是用 `webServer.register` 注册一条前缀路由，把 `public/` 目录挂到 `/plugins/dsh-tes-spinner/`。（DSH 的 `/plugins/` 端点只提供客户端 bundle 和 RPC，**不提供任意插件文件**，所以必须自己注册。）
- `lib/client.js` —— 浏览器侧。用 `window.__ModuleLoader__.load({ id, factory })` 包装，自己 `createRoot` 挂到 `document.body`。

## 素材来源与声明

- **音频与歌词**：来自 B 站 UP 主 **蔚蓝边际** 的作品 [TES先锋赛单曲1.0《突然的陀螺》](https://www.bilibili.com/video/BV1h5QaY5EaH)（BV1h5QaY5EaH）。
  该曲为改编翻唱，完整归属如下：

  | 角色 | 署名 |
  | --- | --- |
  | 原曲 | 《突然的自我》 |
  | 原唱 | 伍佰 |
  | 填词 / 翻唱 / 视频 | 蔚蓝边际 |
  | 混音 | @SpecialSound |

  版权归上述原作者所有，此处仅作非商业的个人使用与演示。
- **陀螺图形**：为 **TES（滔搏电子竞技俱乐部）** 战队标志样式，属其商标/标识。**仅限非商业的社区个人使用**，不得用于商业用途。
- **代码**：本项目自带代码由作者编写。

如原作者或权利方对素材使用有异议，请联系删除。

## 已知限制

- 陀螺位置、转速偏好存在浏览器 `localStorage`，换浏览器或清缓存会重置
- 歌词目前读的是**固定文件名** `public/sudden-spinner.lrc`；换歌需要同时替换 `.mp3` 和 `.lrc`，并在 `lib/client.js` 里改 `LYRICS_URL` 与 `<audio>` 的 `src`
- 音频文件约 3.3 MB，会让仓库体积偏大
