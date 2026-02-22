const THEME_STORAGE_KEY = "eric-terminal-home-theme";
const RECAPTCHA_SCRIPT_ID = "recaptcha-api-script";
const RECAPTCHA_SCRIPT_SRC = "https://www.recaptcha.net/recaptcha/api.js?render=explicit";
const STAGE_COPY = {
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
    constructor() {
        this.cfSiteKey = "0x4AAAAAAB8gIz-w588B8gQ-";
        this.googleSiteKey = "6Lf2dvYrAAAAAI4-JSRGx_0Cp4keDrsxgLsbfBSm";
        this.stage = "cf-1";
        this.turnstileReady = false;
        this.recaptchaScriptPromise = null;
        this.preloadedVideo = null;
        this.themeMode = "light";
        this.motionProfile = "standard";
        this.tiltBounds = null;
        this.tiltRafId = null;
        this.pointerX = 0;
        this.pointerY = 0;
        this.hasPendingPointer = false;
        this.lastTiltX = 0;
        this.lastTiltY = 0;
        this.lastSpotX = 50;
        this.lastSpotY = 35;
        this.handleTurnstileReady = () => {
            this.turnstileReady = true;
            this.renderStage();
        };
        this.handleThemeToggle = () => {
            const nextTheme = this.themeMode === "light" ? "night" : "light";
            this.applyTheme(nextTheme, true);
        };
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
        }
        else {
            this.renderStage();
        }
    }
    mustGetById(id) {
        const element = document.getElementById(id);
        if (!element) {
            throw new Error(`页面缺少关键节点：${id}`);
        }
        return element;
    }
    mustGetButtonById(id) {
        const element = document.getElementById(id);
        if (!(element instanceof HTMLButtonElement)) {
            throw new Error(`页面缺少按钮节点：${id}`);
        }
        return element;
    }
    initializeTheme() {
        const storedTheme = this.readStoredTheme();
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        const initialTheme = storedTheme ?? (prefersDark ? "night" : "light");
        this.applyTheme(initialTheme, false);
    }
    readStoredTheme() {
        try {
            const value = window.localStorage.getItem(THEME_STORAGE_KEY);
            if (value === "light" || value === "night") {
                return value;
            }
        }
        catch {
            return null;
        }
        return null;
    }
    initializeMotionProfile() {
        const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
        const lowConcurrency = typeof navigator.hardwareConcurrency === "number" &&
            navigator.hardwareConcurrency > 0 &&
            navigator.hardwareConcurrency <= 6;
        const deviceMemory = navigator.deviceMemory;
        const lowMemory = typeof deviceMemory === "number" && deviceMemory <= 8;
        const shouldBalanceMotion = prefersReducedMotion || coarsePointer || lowConcurrency || lowMemory;
        this.motionProfile = shouldBalanceMotion ? "balanced" : "standard";
        this.body.classList.toggle("motion-balanced", shouldBalanceMotion);
    }
    applyTheme(theme, persist) {
        this.themeMode = theme;
        const isNight = theme === "night";
        const nextThemeLabel = isNight ? "切换为日间主题" : "切换为夜间主题";
        this.body.classList.toggle("theme-night", theme === "night");
        this.themeToggleButton.classList.toggle("is-night", isNight);
        this.themeToggleButton.setAttribute("aria-pressed", isNight ? "true" : "false");
        this.themeToggleButton.setAttribute("aria-label", nextThemeLabel);
        this.themeToggleButton.setAttribute("title", nextThemeLabel);
        if (!persist) {
            return;
        }
        try {
            window.localStorage.setItem(THEME_STORAGE_KEY, theme);
        }
        catch {
            return;
        }
    }
    bootstrapUIEffects() {
        this.createParticles();
        this.enableCardTilt();
    }
    createParticles() {
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
    enableCardTilt() {
        const isFinePointer = window.matchMedia("(pointer: fine)").matches;
        if (!isFinePointer) {
            return;
        }
        const refreshBounds = () => {
            this.tiltBounds = this.card.getBoundingClientRect();
        };
        const scheduleTiltUpdate = () => {
            if (this.tiltRafId !== null) {
                return;
            }
            this.tiltRafId = window.requestAnimationFrame(() => {
                this.tiltRafId = null;
                this.applyTiltFromPointer();
            });
        };
        this.card.addEventListener("mouseenter", () => {
            refreshBounds();
        });
        this.card.addEventListener("mousemove", (event) => {
            this.pointerX = event.clientX;
            this.pointerY = event.clientY;
            this.hasPendingPointer = true;
            scheduleTiltUpdate();
        });
        this.card.addEventListener("mouseleave", () => {
            this.hasPendingPointer = false;
            if (this.tiltRafId !== null) {
                window.cancelAnimationFrame(this.tiltRafId);
                this.tiltRafId = null;
            }
            this.resetTilt();
        });
        window.addEventListener("resize", refreshBounds, { passive: true });
    }
    applyTiltFromPointer() {
        if (!this.hasPendingPointer) {
            return;
        }
        if (!this.tiltBounds) {
            this.tiltBounds = this.card.getBoundingClientRect();
        }
        const bounds = this.tiltBounds;
        if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
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
    resetTilt() {
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
    clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }
    renderStage() {
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
                        callback: (token) => this.onTurnstileSuccess(token),
                    });
                }
                else {
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
    useTurnstileView() {
        this.turnstileContainer.classList.remove("hidden");
        this.recaptchaContainer.classList.add("hidden");
    }
    useRecaptchaView() {
        this.turnstileContainer.classList.add("hidden");
        this.recaptchaContainer.classList.remove("hidden");
    }
    mountOrResetRecaptcha() {
        if (!window.grecaptcha) {
            this.waitForRecaptcha();
            return;
        }
        this.setMessage("", "warn");
        if (this.recaptchaWidgetId === undefined) {
            this.recaptchaWidgetId = window.grecaptcha.render("recaptcha-container", {
                sitekey: this.googleSiteKey,
                callback: (token) => this.onRecaptchaSuccess(token),
            });
            return;
        }
        window.grecaptcha.reset(this.recaptchaWidgetId);
    }
    ensureRecaptchaScript() {
        if (window.grecaptcha) {
            return Promise.resolve();
        }
        if (this.recaptchaScriptPromise) {
            return this.recaptchaScriptPromise;
        }
        this.recaptchaScriptPromise = new Promise((resolve, reject) => {
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
        }).catch((error) => {
            this.recaptchaScriptPromise = null;
            throw error;
        });
        return this.recaptchaScriptPromise;
    }
    waitForRecaptcha() {
        if (this.recaptchaWaitTimer) {
            return;
        }
        this.setMessage("Google 验证组件加载中，请稍候...", "info");
        void this.ensureRecaptchaScript().catch(() => {
            if (this.recaptchaWaitTimer) {
                window.clearInterval(this.recaptchaWaitTimer);
                this.recaptchaWaitTimer = undefined;
            }
            this.setMessage("Google 验证组件加载失败，请检查网络后重试。", "warn");
        });
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
    onTurnstileSuccess(_token) {
        this.setMessage("✓ 验证成功，正在进行安全复核...", "ok");
        window.setTimeout(() => {
            this.setMessage("检测到环境异常，需追加验证...", "warn");
            window.setTimeout(() => {
                this.stage = this.stage === "cf-1" ? "cf-2" : "google-1";
                this.renderStage();
            }, 1450);
        }, 700);
    }
    onRecaptchaSuccess(_token) {
        this.setMessage("✓ 图像识别通过，正在校验置信度...", "ok");
        window.setTimeout(() => {
            this.setMessage("置信度不足，请继续完成下一轮验证...", "warn");
            window.setTimeout(() => {
                if (this.stage === "google-1") {
                    this.stage = "google-2";
                }
                else if (this.stage === "google-2") {
                    this.stage = "google-3";
                }
                else if (this.stage === "google-3") {
                    this.stage = "final-mockery";
                }
                this.renderStage();
            }, 1450);
        }, 700);
    }
    setMessage(text, tone) {
        this.messageEl.textContent = text;
        this.messageEl.classList.remove("tone-ok", "tone-warn", "tone-info");
        this.messageEl.classList.add(`tone-${tone}`);
    }
    preloadVideo() {
        if (this.preloadedVideo) {
            return;
        }
        const video = document.createElement("video");
        video.preload = "auto";
        video.src = "./rick.mp4";
        video.load();
        this.preloadedVideo = video;
    }
    showFinalStage() {
        if (this.card.classList.contains("final-card") || this.card.classList.contains("is-final-transitioning")) {
            return;
        }
        this.body.classList.add("final-stage");
        this.card.classList.remove("is-tilting", "is-updating");
        this.card.classList.add("is-final-transitioning");
        const transitionOutDuration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 420;
        window.setTimeout(() => {
            this.card.classList.remove("is-final-transitioning");
            this.card.classList.add("final-card");
            this.card.innerHTML = `
        <div class="final-shell" id="final-shell">
          <div class="final-mockery">
            <span class="stage-chip">Access Denied</span>
            <strong>你被耍了</strong>
            <ul class="final-list">
              <li>恭喜你完成了五轮验证，但这里从来没有放行入口。</li>
              <li>你刚刚点过的每一个验证码，都只是流程演出的一部分。</li>
              <li>下次看到“验证进度 98%”，记得先怀疑一下页面动机。</li>
            </ul>
          </div>
          <div class="rick-option-panel" id="rick-option-panel">
            <p class="rick-option-copy">要不要切到 Never Gonna Give You Up？</p>
            <button id="play-rick-button" class="play-rick-button" type="button">
              播放 Never Gonna Give You Up
            </button>
            <p class="final-hint" id="final-hint">点一下按钮，下面会切出播放区域。</p>
          </div>
          <div class="final-video" id="final-video" aria-hidden="true">
            <video id="rick-video" controls loop playsinline preload="auto">
              <source src="./rick.mp4" type="video/mp4" />
            </video>
          </div>
        </div>
      `;
            this.bindFinalPlayOption();
        }, transitionOutDuration);
    }
    bindFinalPlayOption() {
        const finalShell = this.card.querySelector("#final-shell");
        const playButton = this.card.querySelector("#play-rick-button");
        const finalVideoWrap = this.card.querySelector("#final-video");
        const finalVideo = this.card.querySelector("#rick-video");
        const finalHint = this.card.querySelector("#final-hint");
        if (!finalShell || !playButton || !finalVideoWrap || !finalVideo) {
            return;
        }
        playButton.addEventListener("click", () => {
            playButton.disabled = true;
            finalShell.classList.add("is-playing");
            finalVideoWrap.setAttribute("aria-hidden", "false");
            if (finalHint) {
                finalHint.textContent = "正在加载 Never Gonna Give You Up...";
            }
            window.setTimeout(() => {
                finalVideo.currentTime = 0;
                finalVideo.muted = false;
                const playPromise = finalVideo.play();
                if (playPromise && typeof playPromise.catch === "function") {
                    playPromise.catch(() => {
                        if (finalHint) {
                            finalHint.textContent = "浏览器阻止自动播放，请点击视频控件继续。";
                        }
                    });
                }
            }, 220);
        }, { once: true });
    }
}
const start = () => {
    void new VerifyLandingPage();
};
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
}
else {
    start();
}
export {};
