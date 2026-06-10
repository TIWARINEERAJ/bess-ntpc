import * as React from "react";
import { format, parse, isValid } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Hard bounds enforced everywhere a date is picked. */
export const MIN_DATE = new Date(2026, 0, 1); // 01-Jan-2026
export const MAX_DATE = new Date(2028, 11, 31); // 31-Dec-2028

const ISO = "yyyy-MM-dd";

function isoToDate(v: string | null | undefined): Date | undefined {
  if (!v) return undefined;
  const d = parse(v, ISO, new Date());
  return isValid(d) ? d : undefined;
}

export type DatePickerProps = {
  /** ISO date string `yyyy-MM-dd` (or empty / null when unset). */
  value: string | null | undefined;
  /** Receives an ISO `yyyy-MM-dd` string, or "" when cleared. */
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
  className?: string;
  align?: "start" | "center" | "end";
};

/**
 * Calendar-only date entry. Typing is not allowed (prevents erratic entry) and
 * only dates within [2026, 2028] can be selected. Works as a drop-in for the
 * former `<Input type="date" />` fields — same ISO `yyyy-MM-dd` value contract.
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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "h-9 w-full justify-start text-left font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-3.5 w-3.5 shrink-0 opacity-70" />
          <span className="truncate">{selected ? format(selected, "dd-MMM-yyyy") : placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align={align}>
        <Calendar
          mode="single"
          selected={selected}
          month={selected ?? today}
          defaultMonth={selected ?? today}
          captionLayout="dropdown"
          startMonth={MIN_DATE}
          endMonth={MAX_DATE}
          disabled={{ before: MIN_DATE, after: MAX_DATE }}
          today={today}
          onSelect={(d) => {
            if (d) onChange(format(d, ISO));
            else onChange("");
            setOpen(false);
          }}
          initialFocus
          className="pointer-events-auto p-3"
        />
      </PopoverContent>
    </Popover>
  );
}
