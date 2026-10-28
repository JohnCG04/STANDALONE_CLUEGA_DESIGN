import type * as React from "react";

export type DateRange = {
  from?: Date;
  to?: Date;
};

export type TimestampRangeMs = {
  from: number;
  to: number;
};

export type TimePickerProps = Omit<
  React.ComponentProps<"div">,
  "onChange" | "children" | "defaultValue"
> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  leadLabel?: string;
};

export type DateRangePickerDayProps = {
  className?: string;
  style?: React.CSSProperties;
  classNames?: Record<string, string | undefined>;
};

export type DateRangePickerSharedProps = {
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
  minDate?: Date;
  maxDate?: Date;
  placeholder?: string;
  dateFormat?: string;
  locale?: unknown;
  numberOfMonths?: number;
  hidePresets?: boolean;
  dayPickerProps?: DateRangePickerDayProps;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  "aria-label"?: string;
  today?: Date;
  adPublicationRange?: { from: Date; to: Date };
  showTime?: boolean;
  pickerMode?: "range" | "single";
  hideTimeLeadLabel?: boolean;
  /** Drop the start's year when both ends share it: "9/8 - 9/14/26". */
  compactYear?: boolean;
  /** Drawn inside the trigger after the dates — a time zone, say. */
  triggerSuffix?: React.ReactNode;
  /** No ⌄ on the trigger. */
  hideTriggerChevron?: boolean;
};

export type DateRangePickerProps =
  | (DateRangePickerSharedProps & {
      output?: "date";
      value?: DateRange | undefined;
      defaultValue?: DateRange | undefined;
      onChange?: (range: DateRange | undefined) => void;
    })
  | (DateRangePickerSharedProps & {
      output: "ms";
      value?: TimestampRangeMs | undefined;
      defaultValue?: TimestampRangeMs | undefined;
      onChange?: (range: TimestampRangeMs | undefined) => void;
    });
