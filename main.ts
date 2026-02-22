type Stage = "cf-1" | "cf-2" | "google-1" | "google-2" | "google-3" | "final-mockery";
type MessageTone = "ok" | "warn" | "info";
type ThemeMode = "light" | "night";
type MotionProfile = "standard" | "balanced";

const THEME_STORAGE_KEY = "eric-terminal-home-theme";
const RECAPTCHA_SCRIPT_ID = "recaptcha-api-script";
const RECAPTCHA_SCRIPT_SRC = "https://www.recaptcha.net/recaptcha/api.js?render=explicit";
const RECAPTCHA_POLL_INTERVAL_MS = 250;
const RECAPTCHA_MAX_WAIT_MS = 5000;
const FINAL_VIDEO_WEBM_URL = "https://assets.ericterminal.com/Rickroll.webm";
const FINAL_VIDEO_MP4_FALLBACK_URL = "./rick.mp4";

interface TurnstileAPI {
  render: (
    container: string,
    options: { sitekey: string; callback: (token: string) => void }
  ) => string;
  reset: (widgetId?: string) => void;
}

interface ReCaptchaAPI {
  render: (
    container: string,
    options: { sitekey: string; callback: (token: string) => void }
  ) => number;
  reset: (widgetId: number) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileAPI;
    grecaptcha?: ReCaptchaAPI;
    onTurnstileScriptLoad: () => void;
    __turnstileReadyEventFired?: boolean;
  }
}

const STAGE_COPY: Record<Exclude<Stage, "final-mockery">, {
  chip: string;
  title: string;
  subtitle: string;
  helper: string;
}> = {
  "cf-1": {
    chip: "安全网关",
    title: "Eric-Terminal的个人主页",
    subtitle: "检测到当前会话存在风险特征，请先完成一次行为验证。",
    helper: "通常仅需一次验证，完成后系统将自动处理后续流程。",
  },
  "cf-2": {
    chip: "二次校验",
    title: "继续验证",
    subtitle: "网络环境命中轻度风险标记，需要额外的 Turnstile 验证。",
    helper: "完成本轮后将自动切换到最终验证方式。",
  },
  "google-1": {
    chip: "高级验证",
    title: "图像识别校验",
    subtitle: "系统已切换为 Google reCAPTCHA，请按提示完成图像选择。",
    helper: "建议按图中要求精确选择，通常 1 至 2 组即可通过。",
  },
  "google-2": {
    chip: "进度 66%",
    title: "核验进行中",
    subtitle: "系统正在交叉校验识别结果，请继续完成下一组。",
    helper: "已接近完成，保持当前验证节奏即可。",
  },
  "google-3": {
    chip: "进度 98%",
    title: "最终校验",
    subtitle: "最后一轮验证正在执行，完成后将进行最终判定。",
    helper: "请耐心完成本轮，系统会自动给出结果。",
  },
};

class VerifyLandingPage {
  private readonly cfSiteKey = "0x4AAAAAAB8gIz-w588B8gQ-";
  private readonly googleSiteKey = "6Lf2dvYrAAAAAI4-JSRGx_0Cp4keDrsxgLsbfBSm";

  private stage: Stage = "cf-1";
  private turnstileReady = false;
  private turnstileWidgetId: string | undefined;
  private recaptchaWidgetId: number | undefined;
  private recaptchaWaitTimer: number | undefined;
  private recaptchaFallbackTimeout: number | undefined;
  private recaptchaScriptPromise: Promise<void> | null = null;
  private preloadedVideo: HTMLVideoElement | null = null;
  private themeMode: ThemeMode = "light";
  private motionProfile: MotionProfile = "standard";
  private tiltBounds: DOMRect | null = null;
  private tiltRafId: number | null = null;
  private pointerX = 0;
  private pointerY = 0;
  private hasPendingPointer = false;
  private lastTiltX = 0;
  private lastTiltY = 0;
  private lastSpotX = 50;
  private lastSpotY = 35;

  private readonly body: HTMLElement;
  private readonly card: HTMLElement;
  private readonly stageChip: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly subtitleEl: HTMLElement;
  private readonly helperEl: HTMLElement;
  private readonly messageEl: HTMLElement;
  private readonly turnstileContainer: HTMLElement;
  private readonly recaptchaContainer: HTMLElement;
  private readonly particleLayer: HTMLElement;
  private readonly themeToggleButton: HTMLButtonElement;
  private finalThemeToggleButton: HTMLButtonElement | null = null;

  constructor() {
    this.body = document.body;
    this.card = this.mustGetById("main-container");
    this.stageChip = this.mustGetById("stage-chip");
    this.titleEl = this.mustGetById("title");
    this.subtitleEl = this.mustGetById("subtitle");
    this.helperEl = this.mustGetById("helper");
    this.messageEl = this.mustGetById("message");
    this.turnstileContainer = this.mustGetById("turnstile-container");
    this.recaptchaContainer = this.mustGetById("recaptcha-container");
    this.particleLayer = this.mustGetById("particle-layer");
    this.themeToggleButton = this.mustGetButtonById("theme-toggle");

    this.initializeTheme();
    this.initializeMotionProfile();
    this.themeToggleButton.addEventListener("click", this.handleThemeToggle);

    this.bootstrapUIEffects();
    this.setMessage("安全组件加载中，请稍候...", "info");

    window.addEventListener("turnstile-script-ready", this.handleTurnstileReady);

    if (window.turnstile || window.__turnstileReadyEventFired) {
      this.handleTurnstileReady();
    } else {
      this.renderStage();
    }
  }

  private readonly handleTurnstileReady = (): void => {
    this.turnstileReady = true;
    this.renderStage();
  };

  private mustGetById(id: string): HTMLElement {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`页面缺少关键节点：${id}`);
    }
    return element;
  }

  private mustGetButtonById(id: string): HTMLButtonElement {
    const element = document.getElementById(id);
    if (!(element instanceof HTMLButtonElement)) {
      throw new Error(`页面缺少按钮节点：${id}`);
    }
    return element;
  }

  private initializeTheme(): void {
    const storedTheme = this.readStoredTheme();
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initialTheme: ThemeMode = storedTheme ?? (prefersDark ? "night" : "light");

    this.applyTheme(initialTheme, false);
  }

  private readStoredTheme(): ThemeMode | null {
    try {
      const value = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (value === "light" || value === "night") {
        return value;
      }
    } catch {
      return null;
    }

    return null;
  }

  private initializeMotionProfile(): void {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const lowConcurrency =
      typeof navigator.hardwareConcurrency === "number" &&
      navigator.hardwareConcurrency > 0 &&
      navigator.hardwareConcurrency <= 6;
    const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    const lowMemory = typeof deviceMemory === "number" && deviceMemory <= 8;
    const shouldBalanceMotion = prefersReducedMotion || coarsePointer || lowConcurrency || lowMemory;

    this.motionProfile = shouldBalanceMotion ? "balanced" : "standard";
    this.body.classList.toggle("motion-balanced", shouldBalanceMotion);
  }

  private readonly handleThemeToggle = (): void => {
    const nextTheme: ThemeMode = this.themeMode === "light" ? "night" : "light";
    this.applyTheme(nextTheme, true);
  };

  private applyTheme(theme: ThemeMode, persist: boolean): void {
    this.themeMode = theme;
    const isNight = theme === "night";
    const nextThemeLabel = isNight ? "切换为日间主题" : "切换为夜间主题";
    this.body.classList.toggle("theme-night", theme === "night");
    this.applyThemeToggleButtonState(this.themeToggleButton, isNight, nextThemeLabel);
    this.applyThemeToggleButtonState(this.finalThemeToggleButton, isNight, nextThemeLabel);

    if (!persist) {
      return;
    }

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      return;
    }
  }

  private applyThemeToggleButtonState(
    button: HTMLButtonElement | null,
    isNight: boolean,
    nextThemeLabel: string
  ): void {
    if (!button) {
      return;
    }

    button.classList.toggle("is-night", isNight);
    button.setAttribute("aria-pressed", isNight ? "true" : "false");
    button.setAttribute("aria-label", nextThemeLabel);
    button.setAttribute("title", nextThemeLabel);
  }

  private bootstrapUIEffects(): void {
    this.createParticles();
    this.enableCardTilt();
  }

  private createParticles(): void {
    const tones = ["#8ab7ff", "#ffb5df", "#94ffdc", "#c3c8ff"];
    const isBalanced = this.motionProfile === "balanced";
    const count = isBalanced ? 14 : 22;
    const baseDuration = isBalanced ? 11 : 8;
    const durationRange = isBalanced ? 9 : 8;
    const riseMin = isBalanced ? 170 : 180;
    const riseRange = isBalanced ? 55 : 90;
    const driftRange = isBalanced ? 18 : 30;

    for (let index = 0; index < count; index += 1) {
      const particle = document.createElement("span");
      const duration = (baseDuration + Math.random() * durationRange).toFixed(2);
      const delay = (-Math.random() * 12).toFixed(2);
      const size = (2 + Math.random() * 4).toFixed(2);
      const tone = tones[Math.floor(Math.random() * tones.length)] || tones[0];
      const driftX = ((Math.random() - 0.5) * driftRange).toFixed(2);
      const riseDistance = `-${(riseMin + Math.random() * riseRange).toFixed(2)}px`;

      particle.className = "particle";
      particle.style.left = `${(Math.random() * 100).toFixed(2)}%`;
      particle.style.bottom = `${(-15 + Math.random() * 45).toFixed(2)}px`;
      particle.style.setProperty("--duration", `${duration}s`);
      particle.style.setProperty("--delay", `${delay}s`);
      particle.style.setProperty("--size", `${size}px`);
      particle.style.setProperty("--tone", tone);
      particle.style.setProperty("--drift-x", `${driftX}px`);
      particle.style.setProperty("--rise-distance", riseDistance);

      this.particleLayer.appendChild(particle);
    }
  }

  private enableCardTilt(): void {
    const isFinePointer = window.matchMedia("(pointer: fine)").matches;
    if (!isFinePointer) {
      return;
    }

    const refreshBounds = (): void => {
      this.tiltBounds = this.card.getBoundingClientRect();
    };

    const scheduleTiltUpdate = (): void => {
      if (this.tiltRafId !== null) {
        return;
      }

      this.tiltRafId = window.requestAnimationFrame(() => {
        this.tiltRafId = null;
        this.applyTiltFromPointer();
      });
    };

    this.card.addEventListener("mouseenter", refreshBounds);

    window.addEventListener(
      "pointermove",
      (event: PointerEvent) => {
        if (event.pointerType === "touch") {
          return;
        }

        this.pointerX = event.clientX;
        this.pointerY = event.clientY;
        this.hasPendingPointer = true;
        scheduleTiltUpdate();
      },
      { passive: true }
    );

    window.addEventListener("blur", () => {
      this.hasPendingPointer = false;
      if (this.tiltRafId !== null) {
        window.cancelAnimationFrame(this.tiltRafId);
        this.tiltRafId = null;
      }
      this.resetTilt();
    });
    window.addEventListener("pointerdown", refreshBounds, { passive: true });
    window.addEventListener("resize", refreshBounds, { passive: true });
    window.addEventListener("scroll", refreshBounds, { passive: true });
  }

  private applyTiltFromPointer(): void {
    if (!this.hasPendingPointer) {
      return;
    }

    this.tiltBounds = this.card.getBoundingClientRect();
    const bounds = this.tiltBounds;
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
      return;
    }

    const isInsideBounds =
      this.pointerX >= bounds.left &&
      this.pointerX <= bounds.right &&
      this.pointerY >= bounds.top &&
      this.pointerY <= bounds.bottom;
    if (!isInsideBounds) {
      this.resetTilt();
      return;
    }

    const relativeX = this.clamp((this.pointerX - bounds.left) / bounds.width, 0, 1);
    const relativeY = this.clamp((this.pointerY - bounds.top) / bounds.height, 0, 1);
    const rotateY = (relativeX - 0.5) * 8;
    const rotateX = (0.5 - relativeY) * 6;
    const spotX = relativeX * 100;
    const spotY = relativeY * 100;

    const tiltChanged = Math.abs(this.lastTiltX - rotateX) > 0.08 || Math.abs(this.lastTiltY - rotateY) > 0.08;
    const spotChanged = Math.abs(this.lastSpotX - spotX) > 0.8 || Math.abs(this.lastSpotY - spotY) > 0.8;
    if (!tiltChanged && !spotChanged) {
      return;
    }

    this.lastTiltX = rotateX;
    this.lastTiltY = rotateY;
    this.lastSpotX = spotX;
    this.lastSpotY = spotY;

    this.card.classList.add("is-tilting");
    this.card.style.setProperty("--tilt-x", `${rotateX.toFixed(2)}deg`);
    this.card.style.setProperty("--tilt-y", `${rotateY.toFixed(2)}deg`);
    this.card.style.setProperty("--spot-x", `${spotX.toFixed(1)}%`);
    this.card.style.setProperty("--spot-y", `${spotY.toFixed(1)}%`);
  }

  private resetTilt(): void {
    if (
      this.lastTiltX === 0 &&
      this.lastTiltY === 0 &&
      this.lastSpotX === 50 &&
      this.lastSpotY === 35 &&
      !this.card.classList.contains("is-tilting")
    ) {
      return;
    }

    this.lastTiltX = 0;
    this.lastTiltY = 0;
    this.lastSpotX = 50;
    this.lastSpotY = 35;
    this.card.classList.remove("is-tilting");
    this.card.style.setProperty("--tilt-x", "0deg");
    this.card.style.setProperty("--tilt-y", "0deg");
    this.card.style.setProperty("--spot-x", "50%");
    this.card.style.setProperty("--spot-y", "35%");
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private renderStage(): void {
    if (this.stage === "final-mockery") {
      this.clearRecaptchaWaitTimer();
      this.clearRecaptchaFallbackTimeout();
      this.showFinalStage();
      return;
    }

    const copy = STAGE_COPY[this.stage];
    this.card.classList.add("is-updating");
    window.setTimeout(() => {
      this.card.classList.remove("is-updating");
    }, 360);

    this.stageChip.textContent = copy.chip;
    this.titleEl.textContent = copy.title;
    this.subtitleEl.textContent = copy.subtitle;
    this.helperEl.textContent = copy.helper;

    switch (this.stage) {
      case "cf-1":
        this.clearRecaptchaWaitTimer();
        this.clearRecaptchaFallbackTimeout();
        this.useTurnstileView();
        if (!this.turnstileReady || !window.turnstile) {
          this.setMessage("安全组件加载中，请稍候...", "info");
          return;
        }
        this.setMessage("", "warn");
        if (!this.turnstileWidgetId) {
          this.turnstileWidgetId = window.turnstile.render("#turnstile-container", {
            sitekey: this.cfSiteKey,
            callback: (token: string) => this.onTurnstileSuccess(token),
          });
        } else {
          window.turnstile.reset(this.turnstileWidgetId);
        }
        break;

      case "cf-2":
        this.clearRecaptchaWaitTimer();
        this.clearRecaptchaFallbackTimeout();
        this.useTurnstileView();
        if (!this.turnstileReady || !window.turnstile || !this.turnstileWidgetId) {
          this.setMessage("安全组件准备中，请稍候...", "info");
          return;
        }
        this.setMessage("", "warn");
        window.turnstile.reset(this.turnstileWidgetId);
        break;

      case "google-1":
        this.useRecaptchaView();
        this.preloadVideo();
        this.mountOrResetRecaptcha();
        break;

      case "google-2":
      case "google-3":
        this.useRecaptchaView();
        this.mountOrResetRecaptcha();
        break;

      default:
        break;
    }
  }

  private useTurnstileView(): void {
    this.turnstileContainer.classList.remove("hidden");
    this.recaptchaContainer.classList.add("hidden");
  }

  private useRecaptchaView(): void {
    this.turnstileContainer.classList.add("hidden");
    this.recaptchaContainer.classList.remove("hidden");
  }

  private mountOrResetRecaptcha(): void {
    this.startRecaptchaFallbackTimeout();

    if (!window.grecaptcha) {
      this.waitForRecaptcha();
      return;
    }

    this.setMessage("", "warn");

    try {
      if (this.recaptchaWidgetId === undefined) {
        this.recaptchaWidgetId = window.grecaptcha.render("recaptcha-container", {
          sitekey: this.googleSiteKey,
          callback: (token: string) => this.onRecaptchaSuccess(token),
        });
      } else {
        window.grecaptcha.reset(this.recaptchaWidgetId);
      }
    } catch {
      this.handleRecaptchaUnavailable("Google 验证组件初始化失败，已自动跳过该步骤。");
      return;
    }

    this.clearRecaptchaWaitTimer();
    this.clearRecaptchaFallbackTimeout();
  }

  private ensureRecaptchaScript(): Promise<void> {
    if (window.grecaptcha) {
      return Promise.resolve();
    }

    if (this.recaptchaScriptPromise) {
      return this.recaptchaScriptPromise;
    }

    this.recaptchaScriptPromise = new Promise<void>((resolve, reject) => {
      const existingScript = document.getElementById(RECAPTCHA_SCRIPT_ID);
      if (existingScript instanceof HTMLScriptElement) {
        if (window.grecaptcha || existingScript.dataset.loaded === "true") {
          resolve();
          return;
        }
        existingScript.addEventListener("load", () => resolve(), { once: true });
        existingScript.addEventListener("error", () => reject(new Error("reCAPTCHA 脚本加载失败")), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.id = RECAPTCHA_SCRIPT_ID;
      script.src = RECAPTCHA_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        script.dataset.loaded = "true";
        resolve();
      };
      script.onerror = () => reject(new Error("reCAPTCHA 脚本加载失败"));
      document.head.appendChild(script);
    }).catch((error: unknown) => {
      this.recaptchaScriptPromise = null;
      throw error;
    });

    return this.recaptchaScriptPromise;
  }

  private waitForRecaptcha(): void {
    if (this.recaptchaWaitTimer !== undefined) {
      return;
    }

    this.startRecaptchaFallbackTimeout();
    this.setMessage("Google 验证组件加载中，请稍候...", "info");
    void this.ensureRecaptchaScript().catch(() => {
      this.handleRecaptchaUnavailable("Google 验证组件受网络限制，已自动跳过该步骤。");
    });

    this.recaptchaWaitTimer = window.setInterval(() => {
      if (window.grecaptcha) {
        this.clearRecaptchaWaitTimer();
        this.clearRecaptchaFallbackTimeout();
        this.renderStage();
      }
    }, RECAPTCHA_POLL_INTERVAL_MS);
  }

  private clearRecaptchaWaitTimer(): void {
    if (this.recaptchaWaitTimer === undefined) {
      return;
    }

    window.clearInterval(this.recaptchaWaitTimer);
    this.recaptchaWaitTimer = undefined;
  }

  private startRecaptchaFallbackTimeout(): void {
    if (this.recaptchaFallbackTimeout !== undefined) {
      return;
    }

    this.recaptchaFallbackTimeout = window.setTimeout(() => {
      this.recaptchaFallbackTimeout = undefined;
      this.handleRecaptchaUnavailable("Google 验证加载超时（5 秒），已自动跳过该步骤。");
    }, RECAPTCHA_MAX_WAIT_MS);
  }

  private clearRecaptchaFallbackTimeout(): void {
    if (this.recaptchaFallbackTimeout === undefined) {
      return;
    }

    window.clearTimeout(this.recaptchaFallbackTimeout);
    this.recaptchaFallbackTimeout = undefined;
  }

  private handleRecaptchaUnavailable(message: string): void {
    this.clearRecaptchaWaitTimer();
    this.clearRecaptchaFallbackTimeout();

    if (this.stage !== "google-1" && this.stage !== "google-2" && this.stage !== "google-3") {
      return;
    }

    this.setMessage(message, "warn");
    window.setTimeout(() => {
      if (this.stage !== "google-1" && this.stage !== "google-2" && this.stage !== "google-3") {
        return;
      }
      this.stage = "final-mockery";
      this.renderStage();
    }, 900);
  }

  private onTurnstileSuccess(_token: string): void {
    this.setMessage("✓ 验证成功，正在进行安全复核...", "ok");
    window.setTimeout(() => {
      this.setMessage("检测到环境异常，需追加验证...", "warn");
      window.setTimeout(() => {
        this.stage = this.stage === "cf-1" ? "cf-2" : "google-1";
        this.renderStage();
      }, 1450);
    }, 700);
  }

  private onRecaptchaSuccess(_token: string): void {
    this.setMessage("✓ 图像识别通过，正在校验置信度...", "ok");
    window.setTimeout(() => {
      this.setMessage("置信度不足，请继续完成下一轮验证...", "warn");
      window.setTimeout(() => {
        if (this.stage === "google-1") {
          this.stage = "google-2";
        } else if (this.stage === "google-2") {
          this.stage = "google-3";
        } else if (this.stage === "google-3") {
          this.stage = "final-mockery";
        }
        this.renderStage();
      }, 1450);
    }, 700);
  }

  private setMessage(text: string, tone: MessageTone): void {
    this.messageEl.textContent = text;
    this.messageEl.classList.remove("tone-ok", "tone-warn", "tone-info");
    this.messageEl.classList.add(`tone-${tone}`);
  }

  private preloadVideo(): void {
    if (this.preloadedVideo) {
      return;
    }

    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = FINAL_VIDEO_WEBM_URL;
    video.load();
    this.preloadedVideo = video;
  }

  private showFinalStage(): void {
    if (this.card.classList.contains("final-card") || this.card.classList.contains("is-final-transitioning")) {
      return;
    }

    this.body.classList.add("final-stage");
    this.finalThemeToggleButton = null;
    this.card.classList.remove("is-tilting", "is-updating");
    this.card.classList.add("is-final-transitioning");

    const transitionOutDuration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 420;
    const isNightTheme = this.themeMode === "night";
    const nextThemeLabel = isNightTheme ? "切换为日间主题" : "切换为夜间主题";

    window.setTimeout(() => {
      this.card.classList.remove("is-final-transitioning");
      this.card.classList.add("final-card");
      this.card.innerHTML = `
        <div class="spotlight" id="spotlight"></div>
        <div class="final-shell is-playing" id="final-shell">
          <div class="final-toolbar">
            <button
              id="final-theme-toggle"
              class="theme-toggle${isNightTheme ? " is-night" : ""}"
              type="button"
              aria-pressed="${isNightTheme ? "true" : "false"}"
              aria-label="${nextThemeLabel}"
              title="${nextThemeLabel}"
            >
              <span class="theme-icon icon-sun" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <circle cx="12" cy="12" r="4.4"></circle>
                  <path
                    d="M12 2.2v2.2M12 19.6v2.2M21.8 12h-2.2M4.4 12H2.2M18.9 5.1l-1.6 1.6M6.7 17.3l-1.6 1.6M18.9 18.9l-1.6-1.6M6.7 6.7 5.1 5.1"
                  ></path>
                </svg>
              </span>
              <span class="theme-icon icon-moon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <path d="M15.4 3.5a8.9 8.9 0 1 0 5.1 15.8A9.2 9.2 0 0 1 15.4 3.5Z"></path>
                </svg>
              </span>
            </button>
          </div>
          <div class="final-mockery">
            <span class="stage-chip">Access Denied</span>
            <strong>你被耍了</strong>
            <ul class="final-list">
              <li>恭喜你完成了五轮验证，但这里从来没有放行入口。</li>
              <li>你刚刚点过的每一个验证码，都只是流程演出的一部分。</li>
              <li>下次看到“验证进度 98%”，记得先怀疑一下页面动机。</li>
            </ul>
          </div>
          <div class="final-video" id="final-video" aria-hidden="true">
            <video id="rick-video" controls loop playsinline preload="metadata" autoplay muted>
              <source src="${FINAL_VIDEO_WEBM_URL}" type="video/webm" />
              <source src="${FINAL_VIDEO_MP4_FALLBACK_URL}" type="video/mp4" />
            </video>
            <button
              id="audio-toggle-button"
              class="audio-toggle-button"
              type="button"
              aria-label="开启声音"
              title="开启声音"
            >
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path d="M3 10v4h4l5 4V6L7 10H3Zm13.5 2a3.5 3.5 0 0 0-2.2-3.26v6.52A3.5 3.5 0 0 0 16.5 12Z"></path>
              </svg>
            </button>
          </div>
        </div>
      `;

      this.bindFinalVideoAutoPlay();
    }, transitionOutDuration);
  }

  private bindFinalVideoAutoPlay(): void {
    const finalShell = this.card.querySelector<HTMLElement>("#final-shell");
    const audioToggleButton = this.card.querySelector<HTMLButtonElement>("#audio-toggle-button");
    const finalThemeToggleButton = this.card.querySelector<HTMLButtonElement>("#final-theme-toggle");
    const finalVideoWrap = this.card.querySelector<HTMLElement>("#final-video");
    const finalVideo = this.card.querySelector<HTMLVideoElement>("#rick-video");

    if (!finalShell || !audioToggleButton || !finalVideoWrap || !finalVideo || !finalThemeToggleButton) {
      return;
    }

    this.finalThemeToggleButton = finalThemeToggleButton;
    this.finalThemeToggleButton.addEventListener("click", this.handleThemeToggle);

    finalShell.classList.add("is-playing");
    finalVideoWrap.setAttribute("aria-hidden", "false");
    finalVideo.defaultMuted = true;
    finalVideo.muted = true;
    finalVideo.currentTime = 0;
    this.applyAudioToggleButtonState(audioToggleButton, true);

    const startMutedPlayback = (): void => {
      const playPromise = finalVideo.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }
    };

    startMutedPlayback();
    finalVideo.addEventListener("loadeddata", startMutedPlayback, { once: true });

    audioToggleButton.addEventListener("click", () => {
      const shouldUnmute = finalVideo.muted;
      if (shouldUnmute) {
        finalVideo.muted = false;
        finalVideo.defaultMuted = false;
        const playPromise = finalVideo.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => {
            finalVideo.muted = true;
            finalVideo.defaultMuted = true;
            this.applyAudioToggleButtonState(audioToggleButton, true);
          });
        }
        this.applyAudioToggleButtonState(audioToggleButton, false);
        return;
      }

      finalVideo.muted = true;
      finalVideo.defaultMuted = true;
      this.applyAudioToggleButtonState(audioToggleButton, true);
    });
  }

  private applyAudioToggleButtonState(button: HTMLButtonElement, muted: boolean): void {
    if (muted) {
      button.classList.remove("is-unmuted");
      button.setAttribute("aria-label", "开启声音");
      button.setAttribute("title", "开启声音");
      return;
    }

    button.classList.add("is-unmuted");
    button.setAttribute("aria-label", "关闭声音");
    button.setAttribute("title", "关闭声音");
  }
}

const start = (): void => {
  void new VerifyLandingPage();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}

export {};
