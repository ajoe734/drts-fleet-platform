"use client";

import { type CSSProperties, useState } from "react";
import {
  AIRPORT_FAQ,
  AIRPORT_FEATURES,
  AIRPORT_STEPS,
  AIRPORT_VEHICLES,
  type AirportBank,
} from "@/lib/airport-site-data";
import "./airport-transfer-site.css";

// Faithful React port of the design canvas
// docs/05-ui/drts-design-canvas/bank-sites (機場接送 Bank Sites.html + at-app.js).
// `mode="site"` = the per-bank official airport-transfer website (desktop).
// `mode="embed"` = the same site inside the bank's online-banking app webview.

type Mode = "site" | "embed";

function Ic({ d, s = 20, sw = 1.9 }: { d: string; s?: number; sw?: number }) {
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

const nf = (n: number) => "NT$ " + n.toLocaleString("en-US");

export function AirportTransferSite({
  bank,
  mode = "site",
}: {
  bank: AirportBank;
  mode?: Mode;
}) {
  const [step, setStep] = useState(1);
  const [dir, setDir] = useState<"out" | "in">("out");
  const [vehId, setVehId] = useState("sedan");
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [bkId, setBkId] = useState("bk_5512");
  const [form, setForm] = useState({
    terminal: "桃園 T2 · 第二航廈",
    flight: "BR198",
    addr: "台北市信義區松仁路 100 號",
    date: "2026-06-18",
    time: "05:30",
    bags: "2 件",
    phone: "0912-555-401",
  });

  const veh =
    AIRPORT_VEHICLES.find((v) => v.id === vehId) ?? AIRPORT_VEHICLES[0]!;
  const rem = bank.quota.total - bank.quota.used;
  const out = dir === "out";

  function goStep(n: number) {
    if (n === 4) setBkId("bk_" + Math.floor(1000 + Math.random() * 8999));
    setStep(n);
  }

  const themeVars = {
    "--primary": bank.co.primary,
    "--primary-dark": bank.co.primaryDark,
    "--accent": bank.co.accent,
    "--accent-soft": bank.co.accentSoft,
    "--tint": bank.co.tint,
  } as CSSProperties;

  const panelTitles: Record<number, [string, string]> = {
    1: ["驗證接送資格", "確認您的卡別權益"],
    2: ["填寫行程資訊", "選擇航廈、時間與車型"],
    3: ["確認權益與費用", "送出前請確認資訊"],
    4: ["預約成功", "已收到您的預約"],
    5: ["行程追蹤", "司機前往上車點"],
  };
  const [panelTitle, panelSub] = panelTitles[step] ?? panelTitles[1]!;

  const confirmRows: [string, string][] = [
    ["服務", "機場接送 · " + (out ? "出境去程" : "入境回程")],
    ["航班 / 航廈", form.flight + " · " + form.terminal],
    [out ? "上車地點" : "下車地點", form.addr],
    [out ? "前往" : "出發", form.terminal.split(" ")[0] + " 機場"],
    ["用車時間", form.date + " " + form.time],
    ["車型 / 乘客", veh.name + " · " + form.phone],
  ];

  const site = (
    <div className="site" id="top">
      {/* nav */}
      <header className="nav">
        <div className="nav-in">
          <a className="brand" href="#top">
            <span className="mk">{bank.mark}</span>
            <span>
              <span className="bn">{bank.nameZh}</span>
              <span className="bs">{bank.nameEn}</span>
            </span>
            <span className="div" />
            <span className="svc">機場接送</span>
          </a>
          <nav className="nav-links">
            <a href="#service">服務介紹</a>
            <a href="#vehicles">車型</a>
            <a href="#coverage">服務範圍</a>
            <a href="#process">預約流程</a>
            <a href="#faq">常見問題</a>
          </nav>
          <div className="nav-right">
            <span className="holder-chip">
              <span className="dot" />
              {bank.holder.name} · {bank.card}
            </span>
            <a href="#book" className="btn btn-primary">
              立即預約
            </a>
          </div>
        </div>
      </header>

      {/* hero */}
      <section id="hero" className="hero">
        <div className="hero-in">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="ln" />
              {bank.tier} · 機場接送禮遇
            </div>
            <h1 className={bank.serif ? "serif" : undefined}>{bank.hero}</h1>
            <p className="lede">{bank.heroSub}</p>
            <div className="hero-cta">
              <a href="#book" className="btn btn-primary btn-lg">
                立即預約接送{" "}
                <span className="ar">
                  <Ic d="M5 12h14M13 6l6 6-6 6" s={17} sw={2.2} />
                </span>
              </a>
              <a href="#book" className="btn btn-outline btn-lg">
                查詢我的行程
              </a>
            </div>
            <div className="hero-perks">
              {bank.perks.map((p) => (
                <div className="pk" key={p}>
                  <Ic d="M5 12l5 5L20 7" s={17} sw={2.2} />
                  {p}
                </div>
              ))}
            </div>
            <div className="trust">
              <Ic
                d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z"
                s={15}
                sw={2}
              />
              接送服務由 <span className="op">智慧運輸科技</span> 營運 ·
              專業認證司機與合格車隊
            </div>
          </div>
          <div className="hero-vis">
            <div className="card-art">
              <div className="ct">
                <div className="tier">{bank.tier}</div>
                <div className="bk">{bank.nameZh}</div>
              </div>
              <div>
                <div className="chip" />
                <div className="num">5412 •••• •••• {bank.holder.last4}</div>
              </div>
              <div className="cb">
                <span className="nm">{bank.holder.nameEn}</span>
                <span className="vt">{bank.card}</span>
              </div>
            </div>
            <div className="quota-float">
              <div className="ql">本年度免費接送剩餘</div>
              <div className="qn">
                <b>{rem}</b>
                <span>/ {bank.quota.total} 趟</span>
              </div>
              <div className="quota-bar">
                <i
                  style={{
                    width: Math.round((rem / bank.quota.total) * 100) + "%",
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* features */}
      <section id="service" className="blk">
        <div className="wrap">
          <div className="sec-head center">
            <div className="sec-kicker">Why book with us</div>
            <h2>禮賓級的機場接送，每個細節都被照顧</h2>
            <p>
              從預約到抵達，專業司機、即時追蹤與合併入帳，讓商旅與返家都從容。
            </p>
          </div>
          <div className="feat-grid">
            {AIRPORT_FEATURES.map((f) => (
              <div className="feat" key={f.t}>
                <div className="ic">
                  <Ic d={f.p} s={22} />
                </div>
                <h3>{f.t}</h3>
                <p>{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* vehicles */}
      <section id="vehicles" className="blk alt">
        <div className="wrap">
          <div className="sec-head">
            <div className="sec-kicker">Fleet</div>
            <h2>依需求選擇車型</h2>
            <p>
              單人商旅到家庭出遊，皆有合適車型；部分卡別享商務車型免費升等。
            </p>
          </div>
          <div className="veh-grid">
            {AIRPORT_VEHICLES.map((v) => (
              <div className="veh" key={v.id}>
                <div className="vh">
                  <span className="badge">{v.en}</span>
                  <svg
                    width="84"
                    height="44"
                    viewBox="0 0 84 44"
                    fill="none"
                    stroke="var(--primary)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M8 32h68M14 32l5-13h46l5 13M26 19v13M58 19v13" />
                    <circle cx="24" cy="32" r="5" fill="var(--bg)" />
                    <circle cx="60" cy="32" r="5" fill="var(--bg)" />
                  </svg>
                </div>
                <div className="vb">
                  <h3>{v.name}</h3>
                  <div className="en">{v.models}</div>
                  <div className="specs">
                    <div>
                      <span>乘客</span>
                      <b>{v.seats}</b>
                    </div>
                    <div>
                      <span>行李</span>
                      <b>{v.luggage}</b>
                    </div>
                  </div>
                  <div className="note">{v.note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* coverage */}
      <section id="coverage" className="blk">
        <div className="wrap">
          <div className="cov">
            <div>
              <div className="sec-head" style={{ marginBottom: 26 }}>
                <div className="sec-kicker">Coverage</div>
                <h2>服務範圍</h2>
                <p>涵蓋雙北至中南部主要都會區，往返桃園、松山機場。</p>
              </div>
              <div className="cov-airports">
                <div className="ap">
                  <div className="t">主要機場 · AIRPORTS</div>
                  <div className="n">{bank.airports[0]}</div>
                </div>
                <div className="ap">
                  <div className="t">市區機場 · CITY</div>
                  <div className="n">{bank.airports[1]}</div>
                </div>
              </div>
              <div className="cov-list">
                {bank.regions.map((r) => (
                  <div className="rg" key={r}>
                    <Ic
                      d="M12 21s7-5.4 7-11a7 7 0 10-14 0c0 5.6 7 11 7 11z"
                      s={15}
                      sw={2}
                    />
                    {r}
                  </div>
                ))}
              </div>
            </div>
            <div className="cov-map">
              <div className="mt">SERVICE AREA</div>
              <div className="mh">
                北北基桃 · 竹苗 · 中彰 · 南高
                <br />
                主要都會接送網
              </div>
              <span className="pin" style={{ top: "24%", right: "30%" }} />
              <span className="pin" style={{ top: "40%", right: "36%" }} />
              <span className="pin" style={{ top: "62%", right: "42%" }} />
              <span className="pin" style={{ top: "78%", right: "30%" }} />
              <svg
                className="tw"
                viewBox="0 0 120 200"
                fill="rgba(255,255,255,.16)"
                aria-hidden
              >
                <path d="M70 8c10 14 14 30 18 52s10 50 4 74-22 44-34 52-22 4-30-8-10-32-6-58 14-58 22-86 16-40 26-26z" />
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* process */}
      <section id="process" className="blk alt">
        <div className="wrap">
          <div className="sec-head center">
            <div className="sec-kicker">How it works</div>
            <h2>五步驟完成預約</h2>
          </div>
          <div className="steps">
            {AIRPORT_STEPS.map((s) => (
              <div className="step" key={s.n}>
                <div className="sn">{s.n}</div>
                <h4>{s.t}</h4>
                <p>{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* booking widget */}
      <section id="book" className="book">
        <div className="book-in">
          <div className="book-copy">
            <div className="sec-kicker" style={{ color: "var(--accent)" }}>
              Online booking
            </div>
            <h2 className={bank.serif ? "serif" : undefined}>線上即時預約</h2>
            <p>{`以您的${bank.card}權益，三步驟完成機場接送預約，費用合併入帳、無須現場付款。`}</p>
            <div className="bperk">
              <Ic d="M5 13l4 4L19 7" s={18} sw={2} />{" "}
              權益內趟次完全免費，無須現場付款
            </div>
            <div className="bperk">
              <Ic d="M12 6v6l4 2" s={18} sw={2} /> 即時配對司機，2 分鐘內回覆
            </div>
            <div className="bperk">
              <Ic d="M3 11l19-9-9 19-2-8z" s={18} sw={2} />{" "}
              航班動態追蹤，延誤自動順延
            </div>
          </div>

          <div className="panel" id="book-panel">
            <div className="panel-head">
              <div>
                <div className="pt">{panelTitle}</div>
                <div className="ps">{panelSub}</div>
              </div>
              <div className="progress">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className={"pd" + (i < Math.min(step, 3) ? " on" : "")}
                  />
                ))}
              </div>
            </div>
            <div className="panel-body">
              {step === 1 && (
                <div className="bstep">
                  <div className="elig">
                    <div className="ek" />
                    <div className="et">
                      <div className="a">
                        {bank.nameZh} · {bank.card}
                      </div>
                      <div className="b">
                        卡號末四碼 {bank.holder.last4} · {bank.holder.name}
                      </div>
                    </div>
                    <span className="ok">
                      <Ic d="M5 12l5 5L20 7" s={12} sw={3} /> eligible
                    </span>
                  </div>
                  <div className="summ">
                    <div className="sr">
                      <span className="k">持卡身分</span>
                      <span className="v">{bank.tier}</span>
                    </div>
                    <div className="sr">
                      <span className="k">本年度免費趟次</span>
                      <span className="v">
                        {rem} / {bank.quota.total} 趟
                      </span>
                    </div>
                    <div className="sr">
                      <span className="k">服務範圍</span>
                      <span className="v">雙北 · 桃竹 · 中彰 · 南高</span>
                    </div>
                  </div>
                  <p className="fineprint">
                    資格已依您的卡別自動帶入。首次使用將一次性確認服務授權同意。
                  </p>
                  <div className="bfoot">
                    <button
                      className="btn btn-primary btn-block btn-lg"
                      onClick={() => goStep(2)}
                    >
                      開始預約{" "}
                      <span className="ar">
                        <Ic d="M5 12h14M13 6l6 6-6 6" s={16} sw={2.2} />
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="bstep">
                  <div className="seg">
                    <button aria-pressed={out} onClick={() => setDir("out")}>
                      出境 · 去程接送
                    </button>
                    <button aria-pressed={!out} onClick={() => setDir("in")}>
                      入境 · 回程接送
                    </button>
                  </div>
                  <div className="fgrid">
                    <div className="field">
                      <label>
                        機場航廈 <span className="rq">*</span>
                      </label>
                      <select
                        className="inp"
                        value={form.terminal}
                        onChange={(e) =>
                          setForm({ ...form, terminal: e.target.value })
                        }
                      >
                        <option>桃園 T1 · 第一航廈</option>
                        <option>桃園 T2 · 第二航廈</option>
                        <option>松山 TSA</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>
                        航班編號 <span className="rq">*</span>
                      </label>
                      <input
                        className="inp"
                        value={form.flight}
                        onChange={(e) =>
                          setForm({ ...form, flight: e.target.value })
                        }
                      />
                    </div>
                    <div className="field col2">
                      <label>
                        {out ? "上車地點（市區）" : "下車地點（市區）"}{" "}
                        <span className="rq">*</span>
                      </label>
                      <input
                        className="inp"
                        value={form.addr}
                        onChange={(e) =>
                          setForm({ ...form, addr: e.target.value })
                        }
                      />
                    </div>
                    <div className="field">
                      <label>
                        用車日期 <span className="rq">*</span>
                      </label>
                      <input
                        className="inp"
                        value={form.date}
                        onChange={(e) =>
                          setForm({ ...form, date: e.target.value })
                        }
                      />
                    </div>
                    <div className="field">
                      <label>
                        用車時間 <span className="rq">*</span>
                      </label>
                      <input
                        className="inp"
                        value={form.time}
                        onChange={(e) =>
                          setForm({ ...form, time: e.target.value })
                        }
                      />
                    </div>
                    <div className="field">
                      <label>行李件數</label>
                      <select
                        className="inp"
                        value={form.bags}
                        onChange={(e) =>
                          setForm({ ...form, bags: e.target.value })
                        }
                      >
                        <option>1 件</option>
                        <option>2 件</option>
                        <option>3 件</option>
                        <option>4 件以上</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>
                        乘客聯絡電話 <span className="rq">*</span>
                      </label>
                      <input
                        className="inp"
                        value={form.phone}
                        onChange={(e) =>
                          setForm({ ...form, phone: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label>
                      選擇車型 <span className="rq">*</span>
                    </label>
                    <div className="vehpick">
                      {AIRPORT_VEHICLES.map((v) => (
                        <button
                          key={v.id}
                          aria-pressed={v.id === vehId}
                          onClick={() => setVehId(v.id)}
                        >
                          <div className="vn">{v.name}</div>
                          <div className="vs">{v.seats}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="bfoot">
                    <button
                      className="btn btn-outline"
                      onClick={() => goStep(1)}
                    >
                      上一步
                    </button>
                    <button
                      className="btn btn-primary btn-block"
                      onClick={() => goStep(3)}
                    >
                      前往確認{" "}
                      <span className="ar">
                        <Ic d="M5 12h14M13 6l6 6-6 6" s={16} sw={2.2} />
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="bstep">
                  <div className="summ">
                    {confirmRows.map(([k, v]) => (
                      <div className="sr" key={k}>
                        <span className="k">{k}</span>
                        <span className="v">{v}</span>
                      </div>
                    ))}
                  </div>
                  <div className="summ">
                    <div className="sr">
                      <span className="k">基本費用</span>
                      <span className="v">{nf(veh.fare)}</span>
                    </div>
                    <div className="sr">
                      <span className="k">{bank.card} 禮遇扣抵</span>
                      <span className="v">− {nf(veh.fare)}</span>
                    </div>
                    <div className="sr total">
                      <span className="k">您將支付</span>
                      <span className="v">
                        <span className="free-tag">
                          <Ic d="M5 12l5 5L20 7" s={12} sw={3} /> 免費
                        </span>
                      </span>
                    </div>
                  </div>
                  <p className="fineprint">
                    送出後將依 {bank.nameZh}{" "}
                    合作方案派車，並使用一趟免費權益。行程資訊會同步給合作方核銷；超出權益之加價將合併入信用卡帳單。
                  </p>
                  <div className="bfoot">
                    <button
                      className="btn btn-outline"
                      onClick={() => goStep(2)}
                    >
                      返回修改
                    </button>
                    <button
                      className="btn btn-primary btn-block"
                      onClick={() => goStep(4)}
                    >
                      確認送出預約
                    </button>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="bstep">
                  <div className="done-wrap">
                    <div className="done-ring">
                      <svg
                        width="36"
                        height="36"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#15803D"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h3>預約已建立</h3>
                    <div className="bk">{bkId}</div>
                  </div>
                  <div className="summ">
                    <div className="sr">
                      <span className="k">狀態</span>
                      <span className="v">配對司機中</span>
                    </div>
                    <div className="sr">
                      <span className="k">預計回覆</span>
                      <span className="v">2 分鐘內</span>
                    </div>
                    <div className="sr">
                      <span className="k">通知方式</span>
                      <span className="v">簡訊 + App 推播</span>
                    </div>
                  </div>
                  <div className="bfoot">
                    <button
                      className="btn btn-primary btn-block btn-lg"
                      onClick={() => goStep(5)}
                    >
                      追蹤行程
                    </button>
                  </div>
                </div>
              )}

              {step === 5 && (
                <div className="bstep">
                  <div className="track-map">
                    <svg
                      width="100%"
                      height="100%"
                      viewBox="0 0 360 160"
                      preserveAspectRatio="none"
                      aria-hidden
                    >
                      <path
                        d="M30,130 L100,100 L180,86 L260,60 L330,30"
                        stroke="var(--primary)"
                        strokeWidth="3.5"
                        fill="none"
                        strokeLinecap="round"
                      />
                      <circle cx="30" cy="130" r="7" fill="var(--primary)" />
                      <circle
                        cx="330"
                        cy="30"
                        r="7"
                        fill="var(--accent)"
                        stroke="#fff"
                        strokeWidth="2"
                      />
                      <circle cx="180" cy="86" r="9" fill="var(--primary)" />
                      <circle
                        cx="180"
                        cy="86"
                        r="15"
                        fill="var(--primary)"
                        fillOpacity="0.2"
                      />
                    </svg>
                  </div>
                  <div className="track-row">
                    <div className="av">陳</div>
                    <div className="ti">
                      <div className="a">陳俊宏 · 4.86 ★</div>
                      <div className="b">{veh.carName}</div>
                    </div>
                    <div className="eta">
                      <b>8</b>
                      <span>分鐘抵達</span>
                    </div>
                  </div>
                  <div className="summ">
                    <div className="sr">
                      <span className="k">距離</span>
                      <span className="v">2.4 km</span>
                    </div>
                    <div className="sr">
                      <span className="k">狀態</span>
                      <span className="v">已派車 · 前往上車點</span>
                    </div>
                  </div>
                  <div className="bfoot">
                    <button
                      className="btn btn-outline"
                      onClick={() => goStep(1)}
                    >
                      完成 · 返回
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="blk">
        <div className="wrap">
          <div className="sec-head center">
            <div className="sec-kicker">FAQ</div>
            <h2>常見問題</h2>
          </div>
          <div className="faq">
            {AIRPORT_FAQ.map((f, i) => (
              <div className="qa" key={f.q} aria-expanded={faqOpen === i}>
                <button onClick={() => setFaqOpen(faqOpen === i ? null : i)}>
                  {f.q}
                  <span className="qi">
                    <Ic d="M12 5v14M5 12h14" s={20} sw={2} />
                  </span>
                </button>
                <div className="ans">
                  <p>{f.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="ctaband">
        <h2 className={bank.serif ? "serif" : undefined}>準備好出發了嗎？</h2>
        <p>以您的{bank.card}權益，預約一趟禮賓級機場接送。</p>
        <a href="#book" className="btn btn-primary btn-lg">
          立即預約接送
        </a>
      </section>

      {/* footer */}
      <footer className="foot">
        <div className="foot-in">
          <div className="foot-top">
            <div>
              <div className="cobrand">
                <span className="mk">{bank.mark}</span>
                <span>
                  <span className="bn">{bank.nameZh}</span>
                  <br />
                  <span className="bs">機場接送 · Airport Transfer</span>
                </span>
              </div>
              <p
                style={{
                  maxWidth: "30em",
                  fontSize: 13,
                  lineHeight: 1.7,
                  margin: "18px 0 0",
                }}
              >
                本服務為{bank.nameZh}
                提供之卡友禮遇，接送服務由智慧運輸科技營運。權益內容與趟次依各卡別公告為準。
              </p>
            </div>
            <div className="foot-cols">
              <div className="foot-col">
                <div className="ct">服務</div>
                <a href="#service">服務介紹</a>
                <a href="#vehicles">車型介紹</a>
                <a href="#coverage">服務範圍</a>
                <a href="#book">線上預約</a>
              </div>
              <div className="foot-col">
                <div className="ct">支援</div>
                <a href="#faq">常見問題</a>
                <div>客服專線 {bank.support}</div>
                <div>24 小時服務</div>
              </div>
              <div className="foot-col">
                <div className="ct">條款</div>
                <a href="#terms">服務條款</a>
                <a href="#privacy">隱私權政策</a>
                <a href="#rules">權益使用規則</a>
              </div>
            </div>
          </div>
          <div className="foot-bottom">
            <span>© 2026 {bank.nameZh} · 接送服務由智慧運輸科技營運</span>
            <span className="op">
              Powered by <b>智慧運輸科技</b> Smart Transport Technology
            </span>
          </div>
        </div>
      </footer>
    </div>
  );

  if (mode === "embed") {
    return (
      <div className="atsite embed" style={themeVars}>
        <div className="phone">
          <div className="notch" />
          <div className="screen">
            <div className="statusbar">
              <span>09:41</span>
              <span className="ico">
                <svg
                  width="17"
                  height="12"
                  viewBox="0 0 17 12"
                  fill="currentColor"
                  aria-hidden
                >
                  <rect x="0" y="7" width="3" height="5" rx="1" />
                  <rect x="4.5" y="4.5" width="3" height="7.5" rx="1" />
                  <rect x="9" y="2" width="3" height="10" rx="1" />
                  <rect
                    x="13.5"
                    y="0"
                    width="3"
                    height="12"
                    rx="1"
                    opacity=".4"
                  />
                </svg>
              </span>
            </div>
            <div className="appbar">
              <button className="ab-btn" aria-label="返回">
                <Ic d="M15 6l-6 6 6 6" s={18} sw={2.2} />
              </button>
              <div className="ab-t">
                機場接送<small>{bank.nameZh} · 行動銀行</small>
              </div>
              <div className="ab-host">
                <Ic d="M7 11V7a5 5 0 0110 0v4" s={11} sw={2} />
                <span>{bank.host}</span>
              </div>
            </div>
            <div className="webview">{site}</div>
          </div>
          <div className="embed-hint">
            網銀 APP 內嵌 webview · 同一份網頁，行動版自動排版
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="atsite" style={themeVars}>
      {site}
    </div>
  );
}
