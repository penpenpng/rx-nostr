import type { DefaultTheme } from "vitepress";

export const defineContent =
  (def: Record<number, DefaultTheme.SidebarItem[]>) =>
  (lang: string): DefaultTheme.Config => {
    const navItem = (version: string): DefaultTheme.NavItemWithLink => ({
      text: `v${version}.x`,
      link: `/${lang}/v${version}/`,
    });
    const sidebarKey = (version: string) => `/${lang}/v${version}/`;
    const sidebarValue = (
      version: string,
      sidebar: DefaultTheme.SidebarItem[],
    ) =>
      sidebar.map((entry) => ({
        ...entry,
        items: entry.items?.map((item) => ({
          ...item,
          link: `${lang}/v${version}/${item.link}`,
        })),
      }));

    const navItems: DefaultTheme.NavItemWithLink[] = [];
    const sidebarMulti: DefaultTheme.SidebarMulti = {};

    for (const [version, sidebar] of Object.entries(def)) {
      navItems.push(navItem(version));
      sidebarMulti[sidebarKey(version)] = sidebarValue(version, sidebar);
    }

    return {
      nav: [
        { text: lang === "ja" ? "バージョン" : "version", items: navItems },
      ],
      sidebar: sidebarMulti,
    };
  };
