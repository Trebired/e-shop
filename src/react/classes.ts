import { frontendClassName } from "@trebired/frontend";

function classes(...names: string[]): string {
  return names.filter(Boolean).map((name) => frontendClassName(name)).join(" ");
}

export { classes };
