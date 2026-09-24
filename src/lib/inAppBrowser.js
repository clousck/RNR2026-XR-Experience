// Navegadores dentro de apps. En China los QR se escanean casi siempre con
// WeChat, que abre el enlace en su propio navegador: ahi la camara suele
// verse en negro y hay menos memoria para graficos 3D.
const IN_APP = [
  [/MicroMessenger/i, 'WeChat'],
  [/\bQQ\//i, 'QQ'],
  [/Weibo/i, 'Weibo'],
  [/AlipayClient/i, 'Alipay'],
  [/aweme|Douyin/i, 'Douyin'],
  [/BytedanceWebview|musical_ly|TikTok/i, 'TikTok'],
  [/Instagram/i, 'Instagram'],
  [/FBAN|FBAV|FB_IAB/i, 'Facebook'],
  [/\bLine\//i, 'LINE'],
]

/** Nombre de la app si la pagina esta abierta en su navegador interno, o null. */
export function detectInAppBrowser(ua = navigator.userAgent) {
  return IN_APP.find(([re]) => re.test(ua))?.[1] ?? null
}

export const IS_IOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
