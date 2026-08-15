import type { FC } from "react";
import { STORAGE_KEY } from "@/lib/theme";

/**
 * Applies a stored theme choice while the browser is still parsing the head, so a reader who
 * picked light on a dark OS never sees the dark ground paint first.
 *
 * Only a *stored* choice is written. With nothing stored the attribute stays absent and the
 * media query in `globals.css` decides, which is what keeps the OS preference working and is
 * why `layout.tsx` renders no `data-theme` of its own.
 *
 * Nothing is suppressed anywhere as a result: React never renders this attribute, so there is
 * no server and client value to disagree.
 */
const SOURCE = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  STORAGE_KEY,
)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

const ThemeScript: FC = () => (
  <script
    /* `SOURCE` is a module constant with no input in it, and `next/script` cannot stand in
       here: `beforeInteractive` orders against hydration, not against first paint, and paint
       is the thing that has to be beaten. */
    // biome-ignore lint/security/noDangerouslySetInnerHtml: constant source, see above
    dangerouslySetInnerHTML={{ __html: SOURCE }}
  />
);

export default ThemeScript;
