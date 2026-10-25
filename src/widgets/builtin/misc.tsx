import { useEffect, useState } from "react";
import { Line } from "../shared";
import { type BuiltinOption, type WidgetDefinition, type WidgetProps } from "../types";
import { optionValues } from "../web";

const TEXT_OPTIONS: BuiltinOption[] = [{ key: "text", type: "string", labelKey: "widget.opt.text", default: "Text" }];

/** A fixed text: a title, a signature, a label next to another widget. */
function Text({ instance }: WidgetProps) {
  const text = optionValues({ options: TEXT_OPTIONS }, instance.options).text;
  return (
    <div className="leading-tight whitespace-pre-wrap" style={{ fontSize: instance.h * 0.7 * (instance.style?.scale ?? 1), fontWeight: 700 }}>
      {typeof text === "string" ? text : ""}
    </div>
  );
}

const CLOCK_OPTIONS: BuiltinOption[] = [
  { key: "seconds", type: "boolean", labelKey: "widget.opt.seconds", default: false },
  { key: "hour12", type: "boolean", labelKey: "widget.opt.hour12", default: false },
];

/** The time of day, so a stream shows when a play happened. */
function Clock({ instance }: WidgetProps) {
  const options = optionValues({ options: CLOCK_OPTIONS }, instance.options);
  const seconds = options.seconds === true;
  const hour12 = options.hour12 === true;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), seconds ? 250 : 1000);
    return () => clearInterval(id);
  }, [seconds]);
  return (
    <Line instance={instance} fraction={0.7}>
      {now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: seconds ? "2-digit" : undefined, hour12 })}
    </Line>
  );
}

export const MISC_WIDGETS: WidgetDefinition[] = [
  { type: "text", labelKey: "widget.text", defaultSize: { w: 360, h: 44 }, Component: Text, options: TEXT_OPTIONS },
  { type: "clock", labelKey: "widget.clock", defaultSize: { w: 220, h: 44 }, Component: Clock, options: CLOCK_OPTIONS },
];
