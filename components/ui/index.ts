/**
 * The design system's public surface. Import from `@/components/ui` — every
 * primitive is re-exported here so a deep path is never needed to find one.
 *
 * Before hand-rolling a className recipe, check twice:
 *   1. this barrel, for a component or a `cva` variant that already fits
 *      (`Button` alone carries variant × size, including the composer's
 *      `variant="circle"` and `size="pillCompact"`);
 *   2. `../../styles/tokens.css`, for a utility that already fits — but note
 *      those live in `@layer components` and so CANNOT style a component that
 *      emits its own Tailwind utilities (a Button's `rounded-md` outranks them).
 *      Utilities there are for bare elements; a Button's styling goes in its cva.
 */
export { Avatar, AvatarFallback, AvatarImage } from "./avatar";
export { Badge, type BadgeProps } from "./badge";
export { Button, buttonVariants } from "./Button";
export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./Card";
export { Checkbox, type CheckboxProps } from "./checkbox";
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
export { Input, type InputProps } from "./input";
export { Label } from "./label";
export {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "./Popover";
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValue,
} from "./select";
export { Separator } from "./separator";
export { Skeleton } from "./skeleton";
export { Switch } from "./switch";
export {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";
export { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";
export { Textarea, type TextareaProps } from "./textarea";
export {
  UnderlineTabs,
  type UnderlineTabsProps,
  type UnderlineTabItem,
} from "./UnderlineTabs";
