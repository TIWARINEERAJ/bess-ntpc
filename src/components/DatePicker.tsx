import * as React from "react";
import { format, parse, isValid } from "date-fns";
import { CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Allowed date range: 01-Jan-2025 to 31-Dec-2028 */
export const MIN_DATE = new Date(2025, 0, 1);
export const MAX_DATE = new Date(2028, 11, 31);

const ISO = "yyyy-MM-dd";

function isoToDate(v: string | null | undefined): Date | undefined {
  if (!v) return undefined;

  const d = parse(v, ISO, new Date());
  return isValid(d) ? d : undefined;
}

export type DatePickerProps = {
  /** ISO date string yyyy-MM-dd (or empty/null when unset) */
  value: string | null | undefined;

  /** Receives ISO yyyy-MM-dd or "" when cleared */
  onChange: (value: string) => void;

  disabled?: boolean;
  id?: string;
  placeholder?: string;
  className?: string;
  align?: "start" | "center" | "end";
};

/**
 * Calendar-only date picker.
 * - Range: 01-Jan-2025 to 31-Dec-2028
 * - Opens on selected date month if value exists
 * - Otherwise opens on current month
 * - Today's date is highlighted automatically
 */
export function DatePicker({
  value,
  onChange,
  disabled,
  id,
  placeholder = "Pick a date",
  className,
  align = "start",
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  const selected = isoToDate(value);
  const today = new Date();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label="Select date"
          className={cn(
            "h-9 w-full justify-start text-left font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-70" />

          <span className="truncate">{selected ? format(selected, "dd-MMM-yyyy") : placeholder}</span>
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-auto p-0" align={align}>
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? today}
          captionLayout="dropdown"
          startMonth={MIN_DATE}
          endMonth={MAX_DATE}
          disabled={{
            before: MIN_DATE,
            after: MAX_DATE,
          }}
          onSelect={(date) => {
            if (date) {
              onChange(format(date, ISO));
            } else {
              onChange("");
            }

            setOpen(false);
          }}
          initialFocus
          className="pointer-events-auto p-3"
        />
      </PopoverContent>
    </Popover>
  );
}
