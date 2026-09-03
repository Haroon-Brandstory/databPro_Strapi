/**
 * Simple "AI" mark — small I, 4px radius border.
 * Border is a filled ring (not stroke) so Strapi active menu `fill` color applies.
 */
const PluginIcon = () => (
  <svg
    width="23"
    height="23"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden
    fill="currentColor"
  >
    {/* Border ring: outer rx=4, ~1.5px thick */}
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M5.25 1.25h13.5a4 4 0 0 1 4 4v13.5a4 4 0 0 1-4 4H5.25a4 4 0 0 1-4-4V5.25a4 4 0 0 1 4-4Zm0 1.5a2.5 2.5 0 0 0-2.5 2.5v13.5a2.5 2.5 0 0 0 2.5 2.5h13.5a2.5 2.5 0 0 0 2.5-2.5V5.25a2.5 2.5 0 0 0-2.5-2.5H5.25Z"
    />
    {/* A */}
    <path d="M5.2 17.2 8.8 6.8h1.9l3.6 10.4h-2.05l-.75-2.35H8l-.75 2.35H5.2Zm3.1-4.1h2.4L9.75 9.35 8.3 13.1Z" />
    {/* small I */}
    <path d="M16.35 9.4h1.55v7.8h-1.55V9.4Z" />
  </svg>
);

export default PluginIcon;
