// Design tokens — Module A widget library (PRD §7.1 / chuẩn thị giác v1.2).
// NGUỒN TOKEN DUY NHẤT. Widget KHÔNG hardcode màu/cỡ chữ — luôn lấy từ đây.

export const color = {
  inkPrimary: "var(--widget-ink-primary)",
  inkSecondary: "var(--widget-ink-secondary)",
  inkMuted: "var(--widget-ink-muted)",
  series1: "var(--widget-series-1)", // chuỗi biểu đồ chính
  accent: "var(--widget-accent)", // series.2 + màu nhấn
  series3: "var(--widget-series-3)", // chuỗi 3 → ghi nhãn trực tiếp
  series4: "var(--widget-series-4)", // bậc xám thứ 4 của donut — KHÔNG trùng `grid`
  alertRed: "var(--widget-alert)", // chỉ dùng cho ngữ nghĩa tiêu cực / cảnh báo
  alertBg: "var(--widget-alert-bg)", // nền đỏ nhạt cho alert card / ô table
  alertBgStrong: "var(--widget-alert-bg-strong)", // nền đỏ đậm hơn — riêng cho badge/pill để không lẫn vào alert card
  accentBg: "var(--widget-accent-bg)", // nền xanh nhạt cho badge delta tích cực
  stale: "var(--widget-stale)", // "dữ liệu có thể cũ" / "giá trị ước tính"
  staleBg: "var(--widget-stale-bg)",
  border: "var(--widget-border)",
  grid: "var(--widget-grid)", // đường lưới biểu đồ (nét đứt)
  bg: "var(--widget-bg)",
  surfaceMuted: "var(--widget-surface-muted)", // section_header, nền phụ
  onSeries: "var(--widget-on-series)", // chữ nằm TRÊN màu series đã tô đặc
} as const;

// Scrim đè lên ảnh/video (media_card). Ảnh vẫn là ảnh ở cả hai theme, nên các
// giá trị này CỐ Ý không theo theme.
export const overlay = {
  scrim: "rgba(0,0,0,0.55)",
  scrimGradient: "linear-gradient(transparent, rgba(0,0,0,0.7))",
  // Đáy poster tối dần để viên số liệu ở góc dưới đọc được (Figma 12b).
  posterFade: "linear-gradient(transparent, rgba(0,0,0,0.45))",
  posterEdge: "rgba(0,0,0,0.06)",
  playButton: "rgba(0,0,0,0.2)",
  playIcon: "#FFFFFF",
  ink: "#FFFFFF",
  // Tooltip biểu đồ (§7.3): nền tối chữ trắng ở CẢ HAI theme — không đảo theo theme.
  tooltipBg: "#1F1F1F",
  tooltipInk: "#FFFFFF",
} as const;

// Palette chuỗi biểu đồ theo thứ tự ưu tiên.
export const chartSeries = [color.series1, color.accent, color.series3] as const;

/**
 * Bảng màu theo VAI TRÒ mà một widget dùng khi vẽ.
 *
 * `color` ở trên là bảng token đóng băng theo PRD §7.1: ở đó `accent` vừa là
 * chuỗi thứ hai vừa là màu tích cực, và `stale` vừa là "dữ liệu cũ" vừa là màu
 * cảnh báo. Một dashboard báo cáo cần tách hai nghĩa đó ra — chuỗi so sánh phải
 * khác màu "tốt", và "cần theo dõi" phải khác "ước tính".
 *
 * Nên bảng này đặt tên theo vai trò, còn bảng MẶC ĐỊNH chỉ là các bí danh trỏ
 * về đúng token cũ. Widget viết `p.positive` một lần và chạy đúng ở cả hai chế
 * độ; đường mặc định render ra đúng chuỗi CSS như trước khi có file này.
 */
export interface WidgetPalette {
  inkPrimary: string;
  inkSecondary: string;
  inkMuted: string;
  /** Chuỗi dữ liệu chính. */
  series1: string;
  /** Chuỗi so sánh. */
  series2: string;
  series3: string;
  /** Bậc thứ tư — chỉ thang màu donut dùng tới. */
  series4: string;
  positive: string;
  positiveBg: string;
  warning: string;
  warningBg: string;
  critical: string;
  criticalBg: string;
  /** Nền đậm hơn — dành cho badge/pill để không lẫn vào nền dòng cảnh báo. */
  criticalBgStrong: string;
  border: string;
  grid: string;
  bg: string;
  /** Nền phụ: zebra, thẻ, section header. */
  surfaceMuted: string;
  /** Nền phụ ĐẬM hơn một bậc: hàng tiêu đề bảng, dòng tổng. */
  surfaceStrong: string;
  onSeries: string;
}

/**
 * Bí danh về bảng token đóng băng. Mọi widget không bật cờ dùng bảng này, nên
 * "đổi sang palette" là một phép thay tên thuần tuý ở đường mặc định.
 */
const DEFAULT_PALETTE: WidgetPalette = {
  inkPrimary: color.inkPrimary,
  inkSecondary: color.inkSecondary,
  inkMuted: color.inkMuted,
  series1: color.series1,
  series2: color.accent,
  series3: color.series3,
  series4: color.series4,
  positive: color.accent,
  positiveBg: color.accentBg,
  warning: color.stale,
  warningBg: color.staleBg,
  critical: color.alertRed,
  criticalBg: color.alertBg,
  criticalBgStrong: color.alertBgStrong,
  border: color.border,
  grid: color.grid,
  bg: color.bg,
  surfaceMuted: color.surfaceMuted,
  surfaceStrong: color.surfaceMuted,
  onSeries: color.onSeries,
};

/**
 * Bảng màu báo cáo. Biến CSS riêng (`--cc-*`), không đụng vào `--widget-*`, và
 * có đủ giá trị cho cả light lẫn dark trong globals.css.
 */
const COMMAND_CENTER_PALETTE: WidgetPalette = {
  inkPrimary: "var(--cc-ink)",
  inkSecondary: "var(--cc-ink-secondary)",
  inkMuted: "var(--cc-ink-muted)",
  series1: "var(--cc-primary)",
  series2: "var(--cc-secondary)",
  series3: "var(--cc-series-3)",
  series4: "var(--cc-series-4)",
  positive: "var(--cc-positive)",
  positiveBg: "var(--cc-positive-bg)",
  warning: "var(--cc-warning)",
  warningBg: "var(--cc-warning-bg)",
  critical: "var(--cc-critical)",
  criticalBg: "var(--cc-critical-bg)",
  criticalBgStrong: "var(--cc-critical-bg-strong)",
  border: "var(--cc-border)",
  grid: "var(--cc-grid)",
  bg: "var(--cc-bg)",
  surfaceMuted: "var(--cc-surface)",
  surfaceStrong: "var(--cc-surface-strong)",
  onSeries: "var(--cc-on-series)",
};

/**
 * The default palette with the Pulse chat's series (`--pulse-series-*`); every other role is the
 * frozen token. Read only through `useWidgetPalette` on a chat board.
 */
export const PULSE_CHAT_PALETTE: WidgetPalette = {
  ...DEFAULT_PALETTE,
  series1: "var(--pulse-series-1)",
  series2: "var(--pulse-series-2)",
  series3: "var(--pulse-series-3)",
};

/** Bảng màu cho một `presentation`. Vắng cờ → đúng token cũ. */
export function paletteFor(presentation?: string): WidgetPalette {
  return presentation === "command_center" ? COMMAND_CENTER_PALETTE : DEFAULT_PALETTE;
}

/** Ba chuỗi biểu đồ của một bảng màu, theo thứ tự ưu tiên. */
export function seriesOf(p: WidgetPalette): readonly string[] {
  return [p.series1, p.series2, p.series3];
}

// 6 cấp chữ (§7.1 + valueCompact + meta). valueCompact là cấp "value" thu gọn
// dùng khi một con số nằm cạnh đồ hoạ (ví dụ nhãn + giá trị của goal_gauge
// trên cùng một dòng) — không đủ chỗ cho cỡ kpi (28px) nhưng vẫn cần một cấp
// có tên, không phải literal tuỳ tiện.
//
// `meta` là cấp THẤP NHẤT, và nó không phải "caption nhỏ hơn cho đẹp": nó
// dành cho thứ chữ nói về SỐ LIỆU chứ không phải là số liệu — nguồn
// ("TikTok Ads"), độ mới ("Cập nhật 1 phút trước") và mốc so sánh ("so kỳ
// trước"). Ba thứ đó lặp lại trên MỌI thẻ của board, nên ở cùng cấp với
// caption chúng đọc ngang hàng với nội dung thật và ăn chỗ của nó — chính là
// cái làm bốn thẻ KPI phải cắt chữ. Nhỏ hơn một cấp thì chúng lùi về đúng
// vai trò chú thích và trả lại bề ngang cho tiêu đề lẫn con số.
//
// 10px là sàn: dưới nữa thì rơi khỏi ngưỡng đọc được ở mật độ này.
export const font = {
  title: "14px",
  body: "12px",
  caption: "12px",
  meta: "10px",
  kpi: "28px",
  kpiMobile: "24px",
  valueCompact: "18px",
} as const;

export const weight = { title: 600, body: 400, caption: 400, kpi: 700 } as const;

// Khoảng chữ của Inter ở cỡ nhỏ (Figma 12b): -2% cỡ chữ. Thẻ đặt `body` cho
// cả khối, tiêu đề ghi đè bằng `title`.
export const tracking = { title: "-0.28px", body: "-0.24px" } as const;

// Mọi con số dùng tabular-nums để canh cột ổn định.
export const tabular = { fontVariantNumeric: "tabular-nums" as const };
