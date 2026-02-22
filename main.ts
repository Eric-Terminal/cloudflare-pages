type Stage = "cf-1" | "cf-2" | "google-1" | "google-2" | "google-3" | "final-mockery";
type MessageTone = "ok" | "warn" | "info";

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
  private preloadedVideo: HTMLVideoElement | null = null;

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

  private bootstrapUIEffects(): void {
    this.createParticles();
    this.enableCardTilt();
  }

  private createParticles(): void {
    const tones = ["#8ab7ff", "#ffb5df", "#94ffdc", "#c3c8ff"];
    const count = 22;

    for (let index = 0; index < count; index += 1) {
      const particle = document.createElement("span");
      const duration = (8 + Math.random() * 8).toFixed(2);
      const delay = (-Math.random() * 12).toFixed(2);
      const size = (2 + Math.random() * 4).toFixed(2);
      const tone = tones[Math.floor(Math.random() * tones.length)] || tones[0];

      particle.className = "particle";
      particle.style.left = `${(Math.random() * 100).toFixed(2)}%`;
      particle.style.bottom = `${(-15 + Math.random() * 45).toFixed(2)}px`;
      particle.style.setProperty("--duration", `${duration}s`);
      particle.style.setProperty("--delay", `${delay}s`);
      particle.style.setProperty("--size", `${size}px`);
      particle.style.setProperty("--tone", tone);

      this.particleLayer.appendChild(particle);
    }
  }

  private enableCardTilt(): void {
    const isFinePointer = window.matchMedia("(pointer: fine)").matches;
    if (!isFinePointer) {
      return;
    }

    this.card.addEventListener("mousemove", (event: MouseEvent) => {
      const bounds = this.card.getBoundingClientRect();
      const relativeX = (event.clientX - bounds.left) / bounds.width;
      const relativeY = (event.clientY - bounds.top) / bounds.height;
      const rotateY = (relativeX - 0.5) * 8;
      const rotateX = (0.5 - relativeY) * 6;

      this.card.classList.add("is-tilting");
      this.card.style.setProperty("--tilt-x", `${rotateX.toFixed(2)}deg`);
      this.card.style.setProperty("--tilt-y", `${rotateY.toFixed(2)}deg`);
      this.card.style.setProperty("--spot-x", `${(relativeX * 100).toFixed(1)}%`);
      this.card.style.setProperty("--spot-y", `${(relativeY * 100).toFixed(1)}%`);
    });

    this.card.addEventListener("mouseleave", () => {
      this.card.classList.remove("is-tilting");
      this.card.style.setProperty("--tilt-x", "0deg");
      this.card.style.setProperty("--tilt-y", "0deg");
      this.card.style.setProperty("--spot-x", "50%");
      this.card.style.setProperty("--spot-y", "35%");
    });
  }

  private renderStage(): void {
    if (this.stage === "final-mockery") {
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
    if (!window.grecaptcha) {
      this.waitForRecaptcha();
      return;
    }

    this.setMessage("", "warn");

    if (this.recaptchaWidgetId === undefined) {
      this.recaptchaWidgetId = window.grecaptcha.render("recaptcha-container", {
        sitekey: this.googleSiteKey,
        callback: (token: string) => this.onRecaptchaSuccess(token),
      });
      return;
    }

    window.grecaptcha.reset(this.recaptchaWidgetId);
  }

  private waitForRecaptcha(): void {
    if (this.recaptchaWaitTimer) {
      return;
    }

    this.setMessage("Google 验证组件加载中，请稍候...", "info");

    let remaining = 40;
    this.recaptchaWaitTimer = window.setInterval(() => {
      if (window.grecaptcha) {
        window.clearInterval(this.recaptchaWaitTimer);
        this.recaptchaWaitTimer = undefined;
        this.renderStage();
        return;
      }

      remaining -= 1;
      if (remaining <= 0) {
        window.clearInterval(this.recaptchaWaitTimer);
        this.recaptchaWaitTimer = undefined;
        this.setMessage("Google 验证组件加载失败，请刷新后重试。", "warn");
      }
    }, 250);
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
    video.preload = "auto";
    video.src = "./rick.mp4";
    video.load();
    this.preloadedVideo = video;
  }

  private showFinalStage(): void {
    this.body.classList.add("final-stage");
    this.card.classList.add("final-card");
    this.card.classList.remove("is-tilting", "is-updating");

    this.card.innerHTML = `
      <div class="final-mockery">
        <span class="stage-chip">Access Denied</span>
        <strong>你被耍了</strong>
        <ul class="final-list">
          <li>恭喜你完成了五轮验证，但这里从来没有放行入口。</li>
          <li>你刚刚点过的每一个验证码，都只是流程演出的一部分。</li>
          <li>下次看到“验证进度 98%”，记得先怀疑一下页面动机。</li>
        </ul>
      </div>
      <div class="final-video">
        <video id="rick-video" autoplay muted loop playsinline preload="auto">
          <source src="./rick.mp4" type="video/mp4" />
        </video>
      </div>
    `;

    const finalVideo = this.card.querySelector<HTMLVideoElement>("#rick-video");
    if (!finalVideo) {
      return;
    }

    const ensurePlay = (): void => {
      const playPromise = finalVideo.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {
          window.setTimeout(ensurePlay, 600);
        });
      }
    };

    ensurePlay();
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
