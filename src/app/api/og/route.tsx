import { ImageResponse } from "@vercel/og";

export const runtime = "edge";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const type = (url.searchParams.get("type") || "").toLowerCase();
    const id = url.searchParams.get("id");
    const theme = (url.searchParams.get("theme") || "dark").toLowerCase();

    if (!type || !id) {
      return new Response("Missing type or id", { status: 400 });
    }

    const apiPath =
      type === "release-note"
        ? `/api/release-notes/${encodeURIComponent(id)}`
        : `/api/documentation/${encodeURIComponent(id)}`;

    const apiOrigin = "https://plazen.org";
    const apiUrl = new URL(apiPath, apiOrigin).toString();

    const res = await fetch(apiUrl);
    if (!res.ok) {
      return new Response("Not found", { status: 404 });
    }

    const data = await res.json();

    const title = (data.topic || data.title || "Plazen").toString();
    const subtitle =
      type === "release-note"
        ? (data.version || "").toString()
        : (data.category || "").toString();
    const dateVal = data.date || data.updated_at || null;
    const dateStr = dateVal
      ? new Date(dateVal).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : "";

    const isLight = theme === "light";
    const bg = isLight ? "#ffffff" : "#0b1220";
    const fg = isLight ? "#0b1220" : "#e6f0fb";
    const muted = isLight ? "#6b7280" : "#9fb6d8";
    const bgGradient = isLight
      ? "linear-gradient(118deg,rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 1) 50%, rgba(87, 199, 133, 1) 100%);"
      : "linear-gradient(118deg,rgba(0, 0, 0, 1) 0%, rgba(12, 28, 19, 1) 50%, rgba(20, 46, 31, 1) 55%, rgba(70, 161, 107, 1) 81%, rgba(87, 199, 133, 1) 100%)";
    const logoUrl = `${url.origin}/logo2.png`;

    const metaText =
      subtitle && dateStr
        ? `${subtitle} • ${dateStr}`
        : subtitle || dateStr || "";

    const containerStyle: any = {
      width: "1200px",
      height: "630px",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      padding: "48px",
      background: bg,
      color: fg,
      fontFamily:
        'Mona Sans, Montserrat, Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
      boxSizing: "border-box",
    };

    const headerStyle: any = {
      display: "flex",
      alignItems: "center",
      gap: 12,
    };

    const heroStyle: any = {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      gap: 48,
      flex: 1,
      marginTop: 8,
      marginBottom: 8,
    };

    const heroInnerStyle: any = {
      display: "flex",
      flexDirection: "column",
      maxWidth: 920,
    };

    const titleStyle: any = {
      fontSize: 56,
      fontWeight: 800,
      lineHeight: 1.02,
      marginBottom: 12,
      wordBreak: "break-word",
      display: "flex",
    };

    const metaStyle: any = {
      fontSize: 20,
      color: muted,
      display: "flex",
      alignItems: "center",
    };

    const footerStyle: any = {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
    };

    const jsx = (
      <div style={{ ...containerStyle, background: bgGradient } as any}>
        <div style={headerStyle as any}>
          <img
            src={logoUrl}
            alt="Plazen logo"
            width="256"
            height="256"
            style={{ borderRadius: 12, display: "block" }}
          />
        </div>

        <div style={heroStyle as any}>
          <div style={heroInnerStyle as any}>
            <div style={titleStyle as any}>{title}</div>
            <div style={metaStyle as any}>{metaText}</div>
          </div>
        </div>

        <div style={footerStyle as any}>
          <div style={{ fontSize: 16, color: muted as any, display: "flex" }}>
            plazen.org
          </div>
        </div>
      </div>
    ) as any;

    const imageOptions: any = { width: 1200, height: 630 };

    try {
      const MAX_TOTAL_FONT_BYTES = 300 * 1024;

      const gfCss = await fetch(
        "https://fonts.googleapis.com/css2?family=Mona+Sans:ital,wght@0,200..900;1,200..900&family=Montserrat:ital,wght@0,100..900;1,100..900&display=swap",
      ).then((r) => r.text());

      const faceRegex = /@font-face\s*{[^}]*}/g;
      const urlRegex = /url\((https:[^)]+)\)/;
      const weightRegex = /font-weight:\s*(\d+)/;

      const faces = gfCss.match(faceRegex) || [];
      const fonts: Array<{
        name: string;
        data: ArrayBuffer;
        weight?: number;
        style?: string;
      }> = [];

      let totalBytes = 0;
      let sizeExceeded = false;

      for (const block of faces) {
        const urlMatch = block.match(urlRegex);
        const weightMatch = block.match(weightRegex);
        if (urlMatch && weightMatch) {
          const fontUrl = urlMatch[1];
          try {
            const fontResp = await fetch(fontUrl);
            if (fontResp.ok) {
              const buf = await fontResp.arrayBuffer();
              const bufSize = buf.byteLength;
              if (totalBytes + bufSize > MAX_TOTAL_FONT_BYTES) {
                sizeExceeded = true;
                break;
              }
              fonts.push({
                name: "Mona Sans",
                data: buf,
                weight: parseInt(weightMatch[1], 10),
                style: "normal",
              });
              totalBytes += bufSize;
            }
          } catch (err) {}
        }
      }

      if (fonts.length > 0 && !sizeExceeded) {
        imageOptions.fonts = fonts;
      } else {
      }
    } catch (err) {}

    return new ImageResponse(jsx, imageOptions);
  } catch (err) {
    return new Response("Internal Server Error", { status: 500 });
  }
}
