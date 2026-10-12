// Compiled browser half of dsh-tes-spinner (hand-produced to match the DSH
// __ModuleLoader__ bundle shape used by official plugins such as dsh-pet and
// dsh-client-ui-skill-explorer). React is pulled through the module host's
// require so the bundle shares the app's single React instance.
window.__ModuleLoader__.load({
  id: 'dsh-tes-spinner',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    var react = require('react')
    var useState = react.useState
    var useRef = react.useRef
    var useCallback = react.useCallback
    var useEffect = react.useEffect
    var createElement = react.createElement
    // 独立挂载用:和 dsh-pet 一样,自己 createRoot 渲染到 body 上的浮层,
    // 不走 slots(所以不需要侧边栏入口)。
    var reactDomClient = require('react-dom/client')

    var TES_SPINNER_NS = 'dsh-tes-spinner'

    // ══════════════════════════════════════════════════════════════
    //  素材替换入口(改这里就能换陀螺外观)
    // ══════════════════════════════════════════════════════════════
    //
    //  SPINNER_IMAGE —— 陀螺图片地址
    //
    //  • 留空字符串 ''  → 用内置的纯 CSS 占位陀螺(默认,无需任何文件)
    //  • 填图片路径     → 就用那张图当陀螺,并绕中心自转
    //
    //  两种填法:
    //    1) 放到插件的 public/ 目录,然后填绝对路径:
    //         var SPINNER_IMAGE = '/plugins/dsh-tes-spinner/gyro.png'
    //    2) 填外部图片 URL(需允许跨域):
    //         var SPINNER_IMAGE = 'https://example.com/gyro.png'
    //
    //  图片要求(建议):
    //    • 透明背景(必须,否则会有底色方块)
    //    • 正方形,建议 512×512 或更大
    //    • 陀螺正视图,主体居中占满画布(自转轴 = 图片中心)
    //    • 文件别太大,建议 200KB 以内
    //    • 支持 png / webp / svg,Chrome 内核都能显示
    //
    //  换图后如果没生效:图加载失败会自动回退到 CSS 陀螺(不会裂图),
    //  按 F12 看 Network 里那个图片请求是否 404。
    //
    // ══════════════════════════════════════════════════════════════
    // 图片走宿主侧注册的静态路由(见 lib/index.js 的 ASSET_PREFIX)。
    var SPINNER_IMAGE = '/plugins/dsh-tes-spinner/tes-gyro.png'

    // 图片陀螺的显示边长(px)
    var SPINNER_IMAGE_SIZE = 140

    // ══════════════════════════════════════════════════════════════
    //  转速默认值(面板里的滑动条可以在运行时改它)
    // ══════════════════════════════════════════════════════════════
    //  1.0 = 基准速度;0.8 = 慢 20%;1.2 = 快 20%
    //  面板上有个"速度"按钮,点开弹出滑动条,实时调节并记住。
    var SPEED_DEFAULT = 0.8
    var SPEED_MIN = 0.2
    var SPEED_MAX = 2.0
    var SPEED_STEP = 0.05
    // 记住用户上次调的值(同一页面会话内)
    var SPEED_STORE_KEY = 'dsh-tes-spinner-speed'
    function loadSpeed() {
      try {
        var v = window.localStorage && window.localStorage.getItem(SPEED_STORE_KEY)
        if (v === null || v === undefined) return SPEED_DEFAULT
        var n = parseFloat(v)
        if (!isFinite(n)) return SPEED_DEFAULT
        return Math.min(SPEED_MAX, Math.max(SPEED_MIN, n))
      } catch (e) {
        return SPEED_DEFAULT
      }
    }
    function saveSpeed(v) {
      try {
        if (window.localStorage) window.localStorage.setItem(SPEED_STORE_KEY, String(v))
      } catch (e) { /* 隐私模式等,忽略 */ }
    }

    // 浮层锚点(相对视口右下角的内边距)
    var FLOAT_RIGHT = 24
    var FLOAT_BOTTOM = 24
    // 拖动偏移的持久化键
    var POS_STORE_KEY = 'dsh-tes-spinner-pos'
    // 至少要留多少像素在视口内,避免拖出屏幕后找不回来
    var POS_MIN_VISIBLE = 80

    /**
     * 读取上次拖动的位置偏移。
     *
     * 存的是相对默认锚点的 {x, y} 位移。读出来后会按当前视口**夹紧**,
     * 因为窗口可能比上次小(换设备、改窗口大小),旧的偏移会把陀螺推到屏幕外。
     */
    function loadPos() {
      try {
        var raw = window.localStorage && window.localStorage.getItem(POS_STORE_KEY)
        if (!raw) return { x: 0, y: 0 }
        var o = JSON.parse(raw)
        if (!o || !isFinite(o.x) || !isFinite(o.y)) return { x: 0, y: 0 }
        return clampPos({ x: o.x, y: o.y })
      } catch (e) {
        return { x: 0, y: 0 }
      }
    }

    function savePos(p) {
      try {
        if (window.localStorage) window.localStorage.setItem(POS_STORE_KEY, JSON.stringify(p))
      } catch (e) { /* ignore */ }
    }

    /**
     * 把偏移夹到合理范围,保证浮层至少有一部分留在视口内。
     *
     * 默认落点在右下角 (FLOAT_RIGHT, FLOAT_BOTTOM)。偏移 x 向左为负、
     * 向右为正;偏移 y 向上为负、向下为正。允许的范围是:向右最多推到
     * 视口左边留 POS_MIN_VISIBLE,向左最多推到视口右边留 POS_MIN_VISIBLE。
     */
    function clampPos(p) {
      try {
        var vw = (window.innerWidth || 1024)
        var vh = (window.innerHeight || 768)
        // 浮层大致尺寸(宽度跟陀螺走,高度含歌词与控件)
        var w = SPINNER_IMAGE_SIZE + 40
        var h = SPINNER_IMAGE_SIZE + 120
        // x:浮层左边缘 = vw - FLOAT_RIGHT - w + x,要求它 <= vw - POS_MIN_VISIBLE
        //    且右边缘 >= POS_MIN_VISIBLE
        var maxX = vw - POS_MIN_VISIBLE - (vw - FLOAT_RIGHT - w)
        var minX = POS_MIN_VISIBLE - (vw - FLOAT_RIGHT)
        // y:同理
        var maxY = vh - POS_MIN_VISIBLE - (vh - FLOAT_BOTTOM - h)
        var minY = POS_MIN_VISIBLE - (vh - FLOAT_BOTTOM)
        return {
          x: Math.max(minX, Math.min(maxX, p.x)),
          y: Math.max(minY, Math.min(maxY, p.y)),
        }
      } catch (e) {
        return { x: 0, y: 0 }
      }
    }

    var DEFAULTS = {
      spinDuration: 3000,
      audioVolume: 0.8,
      spinTurns: 4,
      spinDirection: 'random',
      enableSoundEffect: true,
      enableDrag: true,
    }

    // ── 歌词 ────────────────────────────────────────────────
    // 与音频同名的 .lrc 文件,放在 public/ 下,由宿主侧的静态路由提供。
    // 文件不存在(404)时 lyrics 保持空数组,歌词行整行隐藏,不影响其他功能。
    var LYRICS_URL = '/plugins/dsh-tes-spinner/sudden-spinner.lrc'

    /**
     * 解析 LRC 文本。
     *
     * 支持一行多个时间戳(`[00:01.00][00:05.00]同一句`),以及
     * `[mm:ss]` / `[mm:ss.xx]` / `[mm:ss.xxx]` 三种精度。
     * 元信息行(`[ti:]` `[ar:]` `[al:]` `[by:]` 等)会被忽略。
     *
     * @returns 按时间升序的 [{ t: 秒, text: 文本 }]
     */
    function parseLRC(text) {
      if (typeof text !== 'string' || text === '') return []
      var out = []
      // 去掉 BOM,统一换行
      var body = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
      var lines = body.split('\n')
      // 元信息标签,不作为歌词
      var META = /^\[(ti|ar|al|by|offset|re|ve|length):/i
      var TIME = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g

      for (var i = 0; i < lines.length; i++) {
        var line = lines[i]
        if (line === '' || META.test(line)) continue
        // 收集本行所有时间戳
        TIME.lastIndex = 0
        var stamps = []
        var m
        while ((m = TIME.exec(line)) !== null) {
          var min = parseInt(m[1], 10)
          var sec = parseInt(m[2], 10)
          var frac = m[3] || '0'
          // 补齐到毫秒:'.5' -> 500, '.50' -> 500, '.500' -> 500
          var ms = parseInt((frac + '00').slice(0, 3), 10)
          stamps.push(min * 60 + sec + ms / 1000)
        }
        if (stamps.length === 0) continue
        // 文本 = 最后一个时间戳之后的内容
        var content = line.replace(TIME, '').trim()
        if (content === '') continue
        for (var s = 0; s < stamps.length; s++) {
          out.push({ t: stamps[s], text: content })
        }
      }
      out.sort(function (a, b) { return a.t - b.t })
      return out
    }

    /**
     * 给定播放秒数,返回应显示哪一行歌词的索引。
     * 用二分查找定位最后一个 t <= time 的行;还没到第一行时返回 -1。
     */
    function lyricIndexAt(list, time) {
      if (!list || list.length === 0) return -1
      if (time < list[0].t) return -1
      var lo = 0
      var hi = list.length - 1
      var ans = 0
      while (lo <= hi) {
        var mid = (lo + hi) >> 1
        if (list[mid].t <= time) { ans = mid; lo = mid + 1 }
        else { hi = mid - 1 }
      }
      return ans
    }

    function TesSpinner() {
      var _a = useState(false),
        spinning = _a[0],
        setSpinning = _a[1]
      var _b = useState(0),
        rotation = _b[0],
        setRotation = _b[1]
      var _c = useState(false),
        dragging = _c[0],
        setDragging = _c[1]
      // 拖动偏移:初值取上次记住的位置(已按当前视口夹紧)
      var _d = useState(loadPos),
        position = _d[0],
        setPosition = _d[1]

      var _e = useState(false),
        imgFailed = _e[0],
        setImgFailed = _e[1]
      // 图片是否已成功加载(加载完才切换显示,避免裂图闪烁)
      var _f = useState(false),
        imgLoaded = _f[0],
        setImgLoaded = _f[1]

      // 转速系数:下方速度条实时改它(初值取上次记住的)
      var _g = useState(loadSpeed),
        speedScale = _g[0],
        setSpeedScale = _g[1]

      // 歌词:解析后的 [{t: 秒, text: '...'}]。空数组 = 没有歌词,整行隐藏。
      var _i = useState([]),
        lyrics = _i[0],
        setLyrics = _i[1]
      // 当前应该显示第几行歌词(索引)。-1 = 还没到第一行。
      var _j = useState(-1),
        lyricIndex = _j[0],
        setLyricIndex = _j[1]

      // 动画帧里要读最新转速值,但 frame 回调只在启动时闭包捕获一次,
      // 所以用 ref 让它每帧都能取到滑动条的最新值。
      var speedRef = useRef(speedScale)
      speedRef.current = speedScale

      var audioRef = useRef(null)
      var animRef = useRef(null)
      var velocityRef = useRef(0)
      var dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 })
      // 累积角度存在 ref 里:旋转中再次点击时动画不重启,
      // 角度必须跨次点击连续累积,否则会跳回原点。
      var angleRef = useRef(0)
      // 当前角速度(度/秒,带符号)。点击是"叠加冲量"而不是重置,
      // 所以它必须活在动画帧之外、跨次点击保留。
      var wRef = useRef(0)
      // 本次转动的方向(1 / -1)。一次转动内锁定,停下后才重新随机,
      // 避免 random 模式下连点抽到反向把转速抵消掉。
      var dirRef = useRef(1)
      // 浏览器拒绝过自动播放(NotAllowedError)后置位,避免每次点击反复徒劳调用。
      var audioBlockedRef = useRef(false)
      // 歌词列表与"当前行号"的 ref 镜像:动画帧回调只捕获一次闭包,
      // 必须从 ref 读取最新值,否则会一直用首次渲染时的空数组。
      var lyricsRef = useRef(lyrics)
      lyricsRef.current = lyrics
      var lyricIdxRef = useRef(-1)

      var config = (window.__DSH_TES_SPINNER_CONFIG__ || DEFAULTS)

      var playClickSound = useCallback(function () {
        if (!config.enableSoundEffect) return
        try {
          var AudioCtx = window.AudioContext || window.webkitAudioContext
          if (!AudioCtx) return
          var ctx = new AudioCtx()
          var osc = ctx.createOscillator()
          var gain = ctx.createGain()
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.frequency.setValueAtTime(880, ctx.currentTime)
          osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.12)
          gain.gain.setValueAtTime(0.15, ctx.currentTime)
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12)
          osc.start(ctx.currentTime)
          osc.stop(ctx.currentTime + 0.12)
        } catch (e) { /* ignore */ }
      }, [config.enableSoundEffect])

      // ── 转速模型(参考"抽陀螺"的真实手感)──────────────────
      //
      // 真陀螺不是"匀速转 N 圈然后停",而是:被抽一下 → 加速
      // → 摩擦导致角速度持续衰减 → 越转越慢 → 停下。
      //
      // 所以这里维护的是**当前角速度 ω**(存在 wRef 里),按帧演化:
      //   · 点一次  → ω 累加一记"抽打冲量"(转速叠加,不是重置)
      //   · 每帧    → ω 按摩擦系数指数衰减
      //   · ω 低于阈值 → 停
      // 这样旋转中再点就是**越抽越快**,而不是从头开始转。

      var startSpin = useCallback(function () {
        // ── 方向锁定 ──
        // 一次转动开始后方向就固定,连点只加速不反向。
        // 否则 spinDirection:'random' 会在连点时抽到相反方向,把转速
        // 抵消掉(实测第 3 次点击把 918 deg/s 抵成 -117),越抽越慢。
        // 只有转速归零(停下)后,才重新随机方向。
        if (wRef.current === 0) {
          dirRef.current =
            config.spinDirection === 'random'
              ? (Math.random() > 0.5 ? 1 : -1)
              : (config.spinDirection === 'cw' ? 1 : -1)
        }
        var direction = dirRef.current

        // 单次抽打给的角速度(度/秒)。
        //
        // 注意这里用的是**固定基准** 720 deg/s,而不是从 spinDuration 反推:
        // 若用 spinDuration 反推,DECEL 又由 IMPULSE 算,速度系数会在
        // 分子分母里互相抵消,"降低转速"就完全不起作用(实测 0.5x~1.2x
        // 时长全是 3.0s,转速却没变)。
        var BASE_W = 720
        // 每帧都重新读滑动条的值,这样拖动滑条时**正在转的陀螺立刻变速**。
        // 但滑动条本身只在本次点击与后续帧之间线性插值(见 animate),
        // 这里是"起点速度",所以取当前值即可。
        var scale0 = speedRef.current
        var IMPULSE = BASE_W * scale0
        // 角速度上限:连点最多到这个转速,避免转成"飞轮"(圈数爆炸)
        var MAX_W = IMPULSE * 2.4

        // ── 转速叠加(同向加速)──
        wRef.current = wRef.current + IMPULSE * direction
        if (Math.abs(wRef.current) > MAX_W) {
          wRef.current = MAX_W * Math.sign(wRef.current)
        }

        // ── 摩擦:恒定减速度(线性衰减)──────────────────────────
        //
        // 物理上摩擦阻力矩大致恒定,角速度是**线性**下降:
        //     dω/dt = -k        →  停止时间 = ω / k
        // 于是"转得越快,停得越久"自然成立(ω 翻倍 → 时长翻倍)。
        //
        // 早先用指数衰减(ω *= e^(-t/τ))是错的:指数衰减的停止时刻跟初始
        // 转速只有对数关系,连点加速后时长几乎不变 —— 连点只是"更晃"
        // 而不是"更久",跟真陀螺手感相反。
        //
        // DECEL 是**独立常量**,不从 IMPULSE 反推 —— 否则速度系数
        // 会在 IMPULSE 和 DECEL 里同时出现而抵消,调速就失效了。
        //
        // 取值对照(速度系数=0.8 时,单次点击):
        //   240 → 1.9 圈 / 2.4s   干脆
        //   180 → 2.5 圈 / 3.1s   ← 当前
        //   150 → 3.1 圈 / 3.8s   悠长
        //   120 → 3.8 圈 / 4.7s   拖沓
        // 调大 = 停得快,调小 = 转得久。
        var DECEL = 180
        // 停止阈值:防抖(纯线性衰减本来就会精确到 0)
        var MIN_W = IMPULSE * 0.02

        // ── 音乐:已经在播就**不重播**,也不重置播放位置 ──
        // 每次点击都 currentTime=0 会变成"点一下就重头放",很吵。
        var audio = audioRef.current
        if (audio && config.enableSoundEffect && !audioBlockedRef.current) {
          try {
            audio.loop = true
            if (audio.paused) {
              // 只在这种情况下起播(上一次已停下,或还没播过)
              var pr = audio.play()
              if (pr && pr.catch) {
                pr.catch(function (err) {
                  // 自动播放策略会拒绝非用户手势触发的播放。
                  // 记下来,避免之后每次点击都徒劳地再试一次。
                  if (err && err.name === 'NotAllowedError') {
                    audioBlockedRef.current = true
                  }
                })
              }
            }
            // 注意:不碰 currentTime —— 让它接着放
          } catch (e) { /* ignore */ }
        }

        // 首个动画帧尚未推进的极短窗口内,不该判停
        var hasSpunUp = false

        // 若已有动画在跑,就让它继续跑(它每帧从 wRef 取最新角速度),
        // 不要 cancel + 重启 —— 重启会让角度基准和音乐节奏都断掉。
        if (animRef.current) return
        var lastTime = performance.now()
        setSpinning(true)

        var animate = function (now) {
          var dt = (now - lastTime) / 1000
          lastTime = now
          // 掉帧保护:一帧最多按 50ms 推进,避免切后台回来角度暴涨
          if (dt > 0.05) dt = 0.05
          if (dt < 0) dt = 0

          // 摩擦:恒定减速度,线性下降(不是乘一个衰减系数)
          var w = wRef.current
          var drop = DECEL * dt
          if (Math.abs(w) <= drop) {
            wRef.current = 0
          } else {
            wRef.current = w - Math.sign(w) * drop
          }
          var speed = Math.abs(wRef.current)

          // 累积角度
          angleRef.current += wRef.current * dt
          velocityRef.current = speed
          setRotation(angleRef.current)

          if (!hasSpunUp && speed > IMPULSE * 0.25) hasSpunUp = true

          // 歌词跟随音频播放位置。只在"行号真的变了"时才 setState,
          // 否则每帧都更新会让整棵树重渲染。
          if (audio) {
            try {
              var lt = audio.currentTime || 0
              var idx = lyricIndexAt(lyricsRef.current, lt)
              if (idx !== lyricIdxRef.current) {
                lyricIdxRef.current = idx
                setLyricIndex(idx)
              }
            } catch (e) { /* ignore */ }
          }

          // 音量跟随**当前转速**:以本插件的额定峰值为基准
          if (audio && config.enableSoundEffect) {
            var ratio = Math.min(1, speed / IMPULSE)
            try {
              audio.volume = Math.max(0, Math.min(1, config.audioVolume * ratio))
            } catch (e) { /* ignore */ }
          }

          // 判停:必须已经转起来过,且衰减到阈值以下
          if (!hasSpunUp || speed > MIN_W) {
            animRef.current = requestAnimationFrame(animate)
          } else {
            // ── 完全停止:收尾与释放 ──────────────────────────
            // 这一步要"回到干净初态",否则下次点击会带着上一轮的残留:
            //   · 角速度归零,方向锁解除(下次重新随机)
            //   · 动画句柄置空,避免重复 rAF
            //   · 速度读数归零
            //   · 音乐音量归零后暂停,并把播放位置回退到开头,
            //     这样下次点击是"从头放"而不是接着上一轮的尾巴
            //   · 歌词索引复位,浮条消失(不残留最后一句)
            wRef.current = 0
            velocityRef.current = 0
            animRef.current = null

            if (audio) {
              try {
                audio.volume = 0
                audio.pause()
                // 回退播放位置。个别浏览器对未 seek 过的音频可能抛异常,
                // 已用 try 包住,失败也只是下次接着播,不影响功能。
                audio.currentTime = 0
              } catch (e) { /* ignore */ }
            }

            // 歌词复位:状态与 ref 一起改,避免下一轮判等失效
            lyricIdxRef.current = -1
            setLyricIndex(-1)

            setSpinning(false)
          }
        }
        animRef.current = requestAnimationFrame(animate)
      }, [config.spinDuration, config.spinTurns, config.spinDirection, config.audioVolume, config.enableSoundEffect])

      // 卸载清理:面板关闭时把动画、音频、播放状态全部释放,
      // 否则 rAF 会继续空转、音乐可能继续响(用户切走面板还以为卡住了)。
      useEffect(function () {
        return function () {
          if (animRef.current) {
            cancelAnimationFrame(animRef.current)
            animRef.current = null
          }
          wRef.current = 0
          velocityRef.current = 0
          var a = audioRef.current
          if (a) {
            try {
              a.pause()
              a.volume = 0
            } catch (e) { /* ignore */ }
          }
        }
      }, [])

      // 挂载时拉取歌词。失败(404/网络)就保持空数组,歌词行自动隐藏,
      // 不影响陀螺与音频。
      useEffect(function () {
        var cancelled = false
        var ctrl = null
        try {
          // 支持 AbortController 时用它,卸载能真正掐断请求
          if (typeof AbortController === 'function') {
            ctrl = new AbortController()
          }
          var p = fetch(LYRICS_URL, ctrl ? { signal: ctrl.signal } : undefined)
          if (!p || typeof p.then !== 'function') return
          p.then(function (res) {
            if (!res || !res.ok) throw new Error('HTTP ' + (res ? res.status : '?'))
            return res.text()
          }).then(function (text) {
            if (cancelled) return
            var list = parseLRC(text)
            if (list.length > 0) setLyrics(list)
          }).catch(function () { /* 没有歌词文件或已中止:静默,整行不显示 */ })
        } catch (e) { /* fetch 不可用:忽略 */ }
        return function () {
          cancelled = true
          if (ctrl) {
            try { ctrl.abort() } catch (e) { /* ignore */ }
          }
        }
      }, [])

      var handleClick = useCallback(function () {
        if (dragging) return
        playClickSound()
        startSpin()
        // 音乐播放/音量联动已并入 startSpin(与转速同步),这里不再单独播放。
      }, [dragging, playClickSound, startSpin])

      var handleMouseDown = useCallback(function (e) {
        if (!config.enableDrag) return
        e.preventDefault()
        setDragging(true)
        dragStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          posX: position.x,
          posY: position.y,
        }
      }, [config.enableDrag, position])

      useEffect(function () {
        if (!dragging) return
        var move = function (e) {
          var dx = e.clientX - dragStartRef.current.x
          var dy = e.clientY - dragStartRef.current.y
          // 实时夹紧:拖到屏幕边缘就停住,不让它被拖出可视区
          setPosition(clampPos({
            x: dragStartRef.current.posX + dx,
            y: dragStartRef.current.posY + dy,
          }))
        }
        var up = function () {
          setDragging(false)
          // 松手才写 localStorage,避免拖动过程每帧都写
          setPosition(function (p) {
            savePos(p)
            return p
          })
        }
        window.addEventListener('mousemove', move)
        window.addEventListener('mouseup', up)
        return function () {
          window.removeEventListener('mousemove', move)
          window.removeEventListener('mouseup', up)
        }
      }, [dragging])

      // 窗口尺寸变化时重新夹紧,免得缩小窗口后陀螺留在屏幕外
      useEffect(function () {
        var onResize = function () {
          setPosition(function (p) { return clampPos(p) })
        }
        window.addEventListener('resize', onResize)
        return function () { window.removeEventListener('resize', onResize) }
      }, [])

      // ── 圆台陀螺(照"抽陀螺模拟器"的外观,纯 CSS,无图片)──────
      //
      // 造型:矮胖的暗红圆台,斜立在场景中,右下方一片椭圆投影。
      //
      // 为什么不做成"顶面 + 侧面 + 高光"三层叠加:实测层与层很难对齐,
      // 顶面会飘出主体(像个蘑菇)。改成**单个容器用多层 background 一次画完**,
      // 由浏览器保证同心,不会错位。
      //
      // 自转的可视化:圆台是回转体,纯色转起来看不出变化,所以顶面画一圈
      // 扇形标记(repeating-conic-gradient 限制在顶面椭圆内),靠它转动体现转速。
      var W = 92 // 圆台宽度
      var H = 68 // 圆台高度
      var TILT = -12 // 整体倾斜角(度)
      var TOP_H = 18 // 顶面椭圆高度(用于径向定位)

      // 投影:落在右下方的椭圆
      var shadowEl = createElement('div', {
        style: {
          position: 'absolute',
          left: '50%',
          bottom: 0,
          width: W * 1.35,
          height: 30,
          transform: 'translateX(-50%) translate(16px, 4px)',
          borderRadius: '50%',
          background:
            'radial-gradient(ellipse at center, rgba(0,0,0,.5) 0%, rgba(0,0,0,.24) 46%, rgba(0,0,0,0) 74%)',
          filter: 'blur(2.5px)',
        },
      })

      // 圆台主体:一个 div,多层背景
      //   - 第 1 层:顶面椭圆(深红,带内阴影感)
      //   - 第 2 层:侧面横向明暗(左暗 → 中亮 → 右暗),模拟受光
      // 轮廓:上窄下宽 —— 用 border-radius 的四角不同半径近似圆台
      var gyroOuter = createElement('div', {
        style: {
          position: 'relative',
          width: W,
          height: H,
          transform: 'rotate(' + TILT + 'deg)',
          transformOrigin: '50% 92%',
          borderRadius: '44% 44% 50% 50% / 26% 26% 74% 74%',
          background:
            // 顶面椭圆
            'radial-gradient(ellipse ' + W * 0.46 + 'px ' + TOP_H + 'px at 50% ' + TOP_H + 'px, ' +
            '#7e1b13 0%, #6d1712 62%, rgba(0,0,0,0) 70%), ' +
            // 侧面明暗
            'linear-gradient(90deg, ' +
            '#5e1410 0%, #8e1f16 14%, #c93023 34%, #e04a3c 46%, #c0301f 62%, #8a1d14 84%, #4e110d 100%)',
          boxShadow:
            'inset 0 -6px 12px rgba(0,0,0,.45), inset 0 4px 8px rgba(255,255,255,.06)',
        },
      })

      // 顶面旋转标记:一个偏心亮斑 + 一圈扇形纹,随 rotation 绕中心旋转。
      // 用小尺寸元素叠在顶面上,限制在椭圆内,不会飞出造型。
      var topMark = createElement('div', {
        style: {
          position: 'absolute',
          left: '50%',
          top: TOP_H,
          width: W * 0.8,
          height: TOP_H * 1.85,
          marginLeft: -(W * 0.8) / 2,
          marginTop: -(TOP_H * 1.85) / 2,
          borderRadius: '50%',
          overflow: 'hidden',
          transform: 'rotate(' + rotation + 'deg)',
          // 扇形纹:让转动肉眼可见
          background:
            'repeating-conic-gradient(from 0deg, ' +
            'rgba(255,255,255,.16) 0deg 12deg, rgba(255,255,255,0) 12deg 24deg)',
          mixBlendMode: 'overlay',
          pointerEvents: 'none',
        },
      })

      // 顶面偏心亮斑:转起来时它绕圈,是最明显的转速线索
      var topDot = createElement('div', {
        style: {
          position: 'absolute',
          left: '50%',
          top: TOP_H,
          width: W * 0.62,
          height: TOP_H * 1.5,
          marginLeft: -(W * 0.62) / 2,
          marginTop: -(TOP_H * 1.5) / 2,
          transform: 'rotate(' + rotation + 'deg)',
          pointerEvents: 'none',
        },
      }, createElement('div', {
        style: {
          position: 'absolute',
          left: '50%',
          top: 0,
          width: 7,
          height: 7,
          marginLeft: -3.5,
          marginTop: -3.5,
          borderRadius: '50%',
          background: 'rgba(255,220,210,.75)',
          boxShadow: '0 0 6px rgba(255,180,160,.9)',
        },
      }))

      var gyroCss = createElement('div', {
        style: {
          position: 'relative',
          width: W,
          height: H,
          transform: 'rotate(' + TILT + 'deg)',
          transformOrigin: '50% 92%',
        },
      }, gyroOuter, topMark, topDot)

      // ── 图片陀螺:双面卡片 ─────────────────────────────────
      //
      // 绕 Y 轴自转的平面会在 90° 处宽度归零而不可见(几何必然,实测必现)。
      // 这里不做"假厚度"(给扁平队标硬加厚度反而出戏,方块切片还比图形大),
      // 而是**正反两面贴合的双面卡片**:转到 90° 自然收成一条细线,
      // 再翻过去就是背面 —— 就是卡片翻转的手感。
      //
      // 两面都设 backface-visibility:hidden,各自只在自己朝向时可见,
      // 否则正反面会同时透出来重叠。
      var useImage = SPINNER_IMAGE !== '' && imgLoaded

      var imgFaceStyle = {
        width: SPINNER_IMAGE_SIZE,
        height: SPINNER_IMAGE_SIZE,
        objectFit: 'contain',
        userSelect: 'none',
        pointerEvents: 'none',
        position: 'absolute',
        top: 0,
        left: 0,
        backfaceVisibility: 'hidden',
        // 始终参与布局:用 display:none 隐藏会让部分浏览器跳过加载,
        // onLoad 不触发,图片就永远出不来。用透明度控制显隐。
        opacity: useImage ? 1 : 0,
      }

      // 正面
      var gyroImgFront = SPINNER_IMAGE !== ''
        ? createElement('img', {
            key: 'front',
            src: SPINNER_IMAGE,
            alt: '',
            draggable: false,
            onLoad: function () { setImgLoaded(true) },
            onError: function () { setImgFailed(true) },
            style: Object.assign({}, imgFaceStyle),
          })
        : null

      // 背面(翻过去看到的另一面,图案镜像)
      var gyroImgBack = SPINNER_IMAGE !== ''
        ? createElement('img', {
            key: 'back',
            src: SPINNER_IMAGE,
            alt: '',
            draggable: false,
            style: Object.assign({}, imgFaceStyle, {
              transform: 'rotateY(180deg)',
            }),
          })
        : null

      // 取正面作 onLoad 载体
      var gyroImg = gyroImgFront

      // ── 绕 Y 轴旋转 ───────────────────────────────────────
      //
      // 外层**不加 rotateX/rotateZ 倾斜** —— 那会把 Y 轴也带歪,
      // 转起来就成了"歪着翻",而不是绕自身竖直的 Y 轴转。
      var imgTilt = SPINNER_IMAGE !== ''
        ? createElement(
            'div',
            {
              style: {
                position: 'relative',
                width: SPINNER_IMAGE_SIZE,
                height: SPINNER_IMAGE_SIZE,
                // 透视:让绕 Y 轴转动有立体感
                perspective: SPINNER_IMAGE_SIZE * 3,
                transformStyle: 'preserve-3d',
                // 自转层:绕 Y 轴转,角度来自 rotation
                transform: 'rotateY(' + rotation + 'deg)',
              },
            },
            gyroImgBack,
            gyroImgFront
          )
        : null

      // 图片就绪前先摆着 CSS 陀螺(它同时也是加载失败时的最终兜底)
      var showCss = !useImage
      var gyro = createElement(
        'div',
        {
          style: {
            position: 'relative',
            width: SPINNER_IMAGE_SIZE,
            height: SPINNER_IMAGE_SIZE,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          },
        },
        showCss ? gyroCss : null,
        imgTilt
      )

      // 舞台:拖动位移 + 投影;旋转作用在陀螺内部。
      // 舞台(位移层)稍后组装:它还要把底部的速度条一起装进去,
      // 而速度条的定义在下面,所以这里先留空,定义完再构造。
      var spinner = null

      // ── 速度控制:按钮 + 弹出式滑动条 ──────────────────────
      //
      // 交互:点按钮 → 弹出浮动面板(滑动条 + 当前值) → 实时改转速;
      // 再点按钮或点面板外的遮罩层关闭。
      // 滑动条的值写进 localStorage,下次打开还记得。
      var speedSlider = createElement('input', {
        type: 'range',
        min: SPEED_MIN,
        max: SPEED_MAX,
        step: SPEED_STEP,
        value: speedScale,
        'aria-label': '转速比例',
        onChange: function (e) {
          var v = parseFloat(e.target.value)
          if (!isFinite(v)) return
          v = Math.min(SPEED_MAX, Math.max(SPEED_MIN, v))
          setSpeedScale(v)
          speedRef.current = v
          saveSpeed(v)
        },
        // 拖动滑条时不要顺带把陀螺也拖走
        onMouseDown: function (e) { e.stopPropagation() },
        onWheel: function (e) { e.stopPropagation() },
        style: {
          // 独占整行。滑条是块级独占后,不再需要 flex:1。
          display: 'block',
          width: '100%',
          // 浏览器给 input 的默认 margin 会让它比上面的文字缩进一截,
          // 清零后端点才能跟"点击旋转"/倍率文字对齐。
          margin: 0,
          padding: 0,
          boxSizing: 'border-box',
          accentColor: '#e63329',
          cursor: 'pointer',
        },
      })

      // ── 歌词浮条(在陀螺上方,黑底白字)──────────────────────
      //
      // 单行显示,超出用省略号截断。没有歌词(或还没到第一句)时不渲染,
      // 面板不会多出一条空白。
      var currentLyric =
        lyricIndex >= 0 && lyricIndex < lyrics.length ? lyrics[lyricIndex].text : ''
      var lyricLine = currentLyric !== ''
        ? createElement(
            'div',
            {
              style: {
                position: 'absolute',
                // 与陀螺同宽居中(理由同 speedBar:外层比陀螺宽 16px)
                left: '50%',
                width: SPINNER_IMAGE_SIZE,
                transform: 'translateX(-50%)',
                top: 0,
                // 黑色半透明底 + 白字:陀螺和面板底色都压不住它
                background: 'rgba(0, 0, 0, 0.55)',
                color: '#ffffff',
                padding: '3px 8px',
                borderRadius: 6,
                fontSize: 12,
                lineHeight: 1.5,
                textAlign: 'center',
                // 单行:不换行 + 超出省略
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                pointerEvents: 'none',
                boxSizing: 'border-box',
                zIndex: 3,
              },
              title: currentLyric,
            },
            currentLyric
          )
        : null

      // ── 底部控件(两行)──────────────────────────────────
      //   第 1 行:左=提示文字,右=当前倍率(两端对齐,视觉对称)
      //   第 2 行:滑条独占整行
      //
      // 早先是"提示一行 / 滑条+倍率一行",结果滑条被倍率数字挤掉一截,
      // 整块左右不对称、还比陀螺宽。现在把倍率提到第 1 行右端,
      // 滑条就能占满整行宽度,和陀螺边缘对齐。
      var speedBar = createElement(
        'div',
        {
          style: {
            position: 'absolute',
            // 按**陀螺宽度**居中,而不是撑满外层容器。
            // 外层比陀螺宽 16px(给拖动手感留的边距),控件若 left:0/right:0
            // 就会比陀螺每边多出 8px,滑条端点突出去、和陀螺边缘对不齐。
            left: '50%',
            width: SPINNER_IMAGE_SIZE,
            transform: 'translateX(-50%)',
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
            gap: 6,
            fontSize: 12,
            // 让滑条和文字不要被陀螺的点击区吞掉
            zIndex: 2,
          },
          // 点这条区域不要触发陀螺的点击/拖动
          onClick: function (e) { e.stopPropagation() },
          onMouseDown: function (e) { e.stopPropagation() },
        },
        // 第 1 行:提示(左) + 倍率(右)
        createElement(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              // 左右各留 2px,让文字与滑条端点对齐
              padding: '0 2px',
            },
          },
          createElement(
            'span',
            {
              style: {
                opacity: 0.7,
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              },
            },
            spinning ? '🌀 旋转中…' : '点击旋转 🌀'
          ),
          createElement(
            'span',
            {
              style: {
                opacity: 0.85,
                whiteSpace: 'nowrap',
                fontVariantNumeric: 'tabular-nums',
                pointerEvents: 'none',
                flexShrink: 0,
              },
            },
            speedScale.toFixed(2) + '×'
          )
        ),
        // 第 2 行:滑条独占整行
        speedSlider
      )

      // 把速度条并入位移层,这样拖动陀螺时它跟着一起走。
      //
      // 注意:这里**必须重新构造** spinner,不能对已有的 element 做
      // `spinner.kids.push(...)` —— React 的 createElement 返回的是不可变
      // 元素对象,它**没有 kids 数组**。那种写法在自建桩里能跑,在真实
      // React 里 kids 是 undefined,`undefined.push` 直接抛 TypeError,
      // 整个组件渲染崩溃 → 陀螺整个消失(实测踩过)。
      spinner = createElement(
        'div',
        {
          onMouseDown: handleMouseDown,
          onClick: handleClick,
          style: {
            // 宽度贴近陀螺本身,只留一点点呼吸边距。
            // 早先 +64 是给旧版单行控件留的,现在控件改两行、靠左对齐,
            // 那 64px 会让滑条和歌词浮条都比陀螺宽出一大截,显得松散。
            width: Math.max(SPINNER_IMAGE_SIZE, W) + 16,
            // 底部:两行控件(提示 + 滑条)约 46px。
            // 顶部:有歌词时再给浮条留约 26px。
            height:
              Math.max(SPINNER_IMAGE_SIZE, H) +
              46 +
              (lyricLine ? 26 : 0),
            margin: 0,
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            paddingBottom: 46,
            paddingTop: lyricLine ? 26 : 0,
            boxSizing: 'border-box',
            userSelect: 'none',
            // 浮层不在面板里,拿不到面板主题变量,这里用中性亮色兜底
            color: 'var(--dsw-alias-label-primary, #e8eaf0)',
            cursor: config.enableDrag ? (dragging ? 'grabbing' : 'grab') : 'pointer',
          },
        },
        lyricLine,
        shadowEl,
        gyro,
        speedBar
      )

      var audio = config.enableSoundEffect
        ? createElement('audio', {
            ref: audioRef,
            src: '/plugins/dsh-tes-spinner/sudden-spinner.mp3',
            preload: 'auto',
          })
        : null

      // 外层:常驻浮层。固定在页面右下角,和 dsh-pet 一样浮在内容之上。
      // 不再有面板标题/内边距 —— 它不是一个页面,而是一个挂件。
      return createElement(
        'div',
        {
          style: {
            position: 'fixed',
            // 默认落点:右下角,避开多数界面控件;拖动会改 translate 偏移
            right: FLOAT_RIGHT,
            bottom: FLOAT_BOTTOM,
            zIndex: 900,
            // 只让陀螺本体可点,空白不挡住下面的页面元素
            pointerEvents: 'none',
            userSelect: 'none',
            transform:
              'translate(' + position.x + 'px, ' + position.y + 'px)',
          },
        },
        createElement(
          'div',
          { style: { pointerEvents: 'auto' } },
          spinner
        ),
        audio
      )
    }

    /**
     * 把陀螺常驻挂到页面上(像 dsh-pet 那样),不使用任何 slot。
     *
     * 做法与 dsh-pet 一致:
     *   1. 清掉上一轮遗留的同名容器(热重载会留下一堆)
     *   2. 自建一个 div 挂到 document.body
     *   3. 用 react-dom/client 的 createRoot 独立渲染
     *   4. 返回 disposer:unmount + 移除容器
     *
     * 之所以不走 slots:常驻浮层不属于任何面板席位,注册进去反而会
     * 在侧边栏多出一个入口(用户明确不要)。
     */
    function mountFloating(ctx) {
      // 清理旧实例
      try {
        var stale = document.querySelectorAll('div[data-dsh-tes-spinner-root]')
        for (var i = 0; i < stale.length; i++) stale[i].remove()
      } catch (e) { /* ignore */ }

      var container = document.createElement('div')
      container.dataset.dshTesSpinnerRoot = ''
      container.dataset.dshPlugin = 'dsh-tes-spinner'
      document.body.appendChild(container)

      var root = reactDomClient.createRoot(container)
      root.render(createElement(TesSpinner, null))

      var disposed = false
      return function dispose() {
        if (disposed) return
        disposed = true
        try { root.unmount() } catch (e) { /* ignore */ }
        try { container.remove() } catch (e) { /* ignore */ }
      }
    }

    // 不需要任何 slot 服务:浮层自己挂到 body。
    var inject = []

    function apply(ctx) {
      // 配置可选:宿主侧未注册 settings 时,组件直接用 DEFAULTS
      try {
        if (ctx.settings && typeof ctx.settings.get === 'function') {
          var saved = ctx.settings.get('dsh-tes-spinner')
          if (saved && typeof saved === 'object') {
            window.__DSH_TES_SPINNER_CONFIG__ = Object.assign({}, DEFAULTS, saved)
          }
        }
      } catch (e) { /* settings optional */ }

      var dispose = null
      try {
        dispose = mountFloating(ctx)
      } catch (error) {
        console.warn('[tes-spinner] mount failed:', error)
      }

      // 交给 cordis 的生命周期:插件卸载时清干净(否则浮层会留在页面上)
      if (dispose && typeof ctx.effect === 'function') {
        ctx.effect(function () { return dispose }, 'tes-spinner: floating ui')
      }
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
