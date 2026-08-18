/**
 * ASCII MYRMIDONS wordmark — shared by the terminal boot sequence
 * (app/terminal/page.tsx, one boot entry per row) and the landing hero
 * (components/landing/LandingPage.tsx, rendered as a static block).
 */

export const WORDMARK_ROWS = [
  "███╗░░░███╗██╗░░░██╗██████╗░███╗░░░███╗██╗██████╗░░█████╗░███╗░░██╗░██████╗",
  "████╗░████║╚██╗░██╔╝██╔══██╗████╗░████║██║██╔══██╗██╔══██╗████╗░██║██╔════╝",
  "██╔████╔██║░╚████╔╝░██████╔╝██╔████╔██║██║██║░░██║██║░░██║██╔██╗██║╚█████╗░",
  "██║╚██╔╝██║░░╚██╔╝░░██╔══██╗██║╚██╔╝██║██║██║░░██║██║░░██║██║╚████║░╚═══██╗",
  "██║░╚═╝░██║░░░██║░░░██║░░██║██║░╚═╝░██║██║██████╔╝╚█████╔╝██║░╚███║██████╔╝",
  "╚═╝░░░░░╚═╝░░░╚═╝░░░╚═╝░░╚═╝╚═╝░░░░░╚═╝╚═╝╚═════╝░░╚════╝░╚═╝░░╚══╝╚═════╝░",
];

/** Scramble charset for the wordmark rows: block glyphs, so the art looks
 *  like it materializes out of static rather than out of letters. */
export const WORDMARK_CHARSET = "█░╔╗╚╝║═";
