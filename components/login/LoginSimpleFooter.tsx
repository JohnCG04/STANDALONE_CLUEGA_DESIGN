export function LoginSimpleFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="relative z-10 flex justify-center pb-5 text-[11px] text-neutral-400 dark:text-muted-foreground">
      <span>©{currentYear} Cluega</span>
    </footer>
  );
}
