import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { assignDriverColor } from "./raceDataService";
import "./raceAnimation.css";

export default function RaceAnimation({
  selectedDriverIds,
  trackData,
  allResults,
}) {
  const ref = useRef();
  useEffect(() => {
    const laps = trackData?.lapData?.laps || [];
    if (!ref.current || laps.length === 0) return;

    ref.current.innerHTML = "";

    // build driver list first so sizing can react to driver count
    const drivers = (selectedDriverIds || [])
      .map((id, index) => {
        const driverInfo = allResults?.find(
          (result) => result.Driver?.driverId === id,
        )?.Driver;
        if (!driverInfo) return null;

        const color = assignDriverColor(id, index);
        const data = laps
          .map((lap) => {
            const position = lap.positions?.find(
              (entry) => entry.driverId === id,
            )?.position;
            return position ? { lap: lap.lap, position } : null;
          })
          .filter(Boolean);

        return {
          id,
          index,
            name: `${driverInfo.givenName} ${driverInfo.familyName}`,
            code:
              driverInfo.code ||
              driverInfo.driverId?.slice(0, 3).toUpperCase() ||
              id.slice(0, 3).toUpperCase(),
          color,
          data,
        };
      })
      .filter(Boolean);

    if (drivers.length === 0) return;

    // responsive sizing based on container and driver count
    const baseWidth = Math.max(ref.current.clientWidth, 400) || 800;
    const width = baseWidth;

    const isMobile = baseWidth < 700;
    const baseHeight = isMobile ? 420 : 560;
    const extraHeight = Math.min(400, drivers.length * 12);
    // extra top padding to keep P1 line from touching top
    const marginTopExtra = Math.min(120, Math.ceil(drivers.length * 1.4));
    const hight = baseHeight + extraHeight + marginTopExtra;

    const margin = {
      top: 40 + marginTopExtra,
      right: isMobile ? 30 : Math.max(150, drivers.length * 8),
      bottom: 60,
      left: 55,
    };

    const innerWidth = Math.max(0, width - margin.left - margin.right);
    const innerHeight = Math.max(0, hight - margin.top - margin.bottom);

    if (innerWidth === 0 || innerHeight === 0) return;

    // SVG
    const svg = d3
      .select(ref.current)
      .append("svg")
      .attr("width", "100%")
      .attr("viewBox", `0 0 ${width} ${hight}`)
      .attr("preserveAspectRatio", "xMidYMin meet")
      .attr("height", hight)
      .style("background", "#0B0D10")
      .style("display", "block");

    const chart = svg
      .append("g")
      .attr("transform", `translate(${margin.left}, ${margin.top})`);

    const all = drivers.flatMap((driver) => driver.data);
    const maxLap = d3.max(all, (d) => d.lap) || 1;
    const maxPosition = d3.max(all, (d) => d.position) || drivers.length;

    // reserve right edge space so end labels can sit after final lap point
    const endLabelPad = isMobile
      ? Math.min(110, Math.max(70, drivers.length * 4))
      : Math.min(180, Math.max(90, drivers.length * 6));
    const x = d3
      .scaleLinear()
      .domain([0, maxLap])
      .range([0, Math.max(0, innerWidth - endLabelPad)]);

    // add small headroom above first place by extending top domain slightly
    const headroom = Math.min(1.5, 0.5 + drivers.length * 0.03);
    const y = d3
      .scaleLinear()
      .domain([maxPosition + headroom, 0.5])
      .range([innerHeight, 0]);

    const xTickCount = isMobile ? Math.min(12, maxLap) : Math.min(24, maxLap);

    chart
      .append("g")
      .attr("transform", `translate(0, ${innerHeight})`)
      .call(d3.axisBottom(x).ticks(xTickCount).tickFormat(d3.format("d")))
      .selectAll("text")
      .attr("fill", "#AAA")
      .attr("dy", "1.2em"); // offset labels down for clarity

    chart
      .append("g")
      .call(
        d3
          .axisLeft(y)
          .tickValues(
            Array.from({ length: maxPosition + 1 }, (_, index) => index + 1),
          )
          .tickFormat(d3.format("d")),
      )
      .selectAll("text")
      .attr("fill", "#AAA");

    // smoothing tension increases slightly with more drivers (prevents over-smoothing)
    const smoothing = Math.min(0.6, 0.25 + drivers.length * 0.01);
    const line = d3
      .line()
      .x((d) => x(d.lap))
      .y((d) => y(d.position))
      .curve(
        d3.curveCatmullRom.alpha
          ? d3.curveCatmullRom.alpha(smoothing)
          : d3.curveMonotoneX,
      );

    const clip = chart.append("clipPath").attr("id", "clip");

    const clipRect = clip
      .append("rect")
      .attr("width", 0)
      .attr("height", innerHeight);

    const linesGroup = chart.append("g").attr("clip-path", "url(#clip)");

    drivers.forEach((driver) => {
      linesGroup
        .append("path")
        .datum(driver.data)
        .attr("fill", "none")
        .attr("stroke", driver.color)
        .attr("stroke-width", isMobile ? 3 : 4)
        .attr("d", line);
    });

    clipRect
      .transition()
      .duration(3000)
      .ease(d3.easeCubicOut)
      .attr("width", innerWidth);

    const labels = chart
      .selectAll(".driver-label")
      .data(drivers)
      .enter()
      .append("text")
      .attr("class", "driver-label")
      .attr("dy", "0.35em")
      .attr("fill", (d) => d.color)
      .style("font-size", isMobile ? "10px" : "12px")
      .style("font-weight", "bold")
        .text((d) => d.code)
      .style("opacity", 0)
      .each(function (d) {
        const lastLap = d.data[d.data.length - 1];
        if (lastLap) {
          placeDriverLabel(d3.select(this), d, x(lastLap.lap), y(lastLap.position));
        }
      });

    labels.transition().delay(2000).duration(1000).style("opacity", 1);

    const dots = chart
      .selectAll(".dot")
      .data(drivers)
      .enter()
      .append("circle")
      .attr("r", isMobile ? 5 : 7)
      .attr("fill", (d) => d.color)
      .style("opacity", 0);

    function placeDriverLabel(selection, driver, pointX, pointY) {
      const labelWidth = selection.node()?.getComputedTextLength?.() || 80;
      const padding = 12;
      const rightPad = 10;
      const fitsRight = pointX + padding + labelWidth + rightPad <= innerWidth;
      const xPos = fitsRight
        ? Math.min(pointX + padding, innerWidth - labelWidth)
        : Math.max(0, pointX - labelWidth - padding);

        const yPos = Math.max(12, Math.min(innerHeight - 8, pointY));

      selection
        .attr("x", xPos)
        .attr("y", yPos)
        .attr("text-anchor", fitsRight ? "start" : "end");
    }

    const tooltip = d3
      .select(ref.current)
      .append("div")
      .style("position", "fixed")
      .style("z-index", "10")
      .style("background", "#111")
      .style("padding", "8px")
      .style("border-radius", "6px")
      .style("color", "#fff")
      .style("font-size", "12px")
      .style("pointer-events", "none")
      .style("opacity", 0);

    function move(event) {
      const bounds = chart.node().getBoundingClientRect();
      const rawX = event.clientX - bounds.left;
      const mx = Math.max(0, Math.min(innerWidth, rawX));
      const lap = Math.max(1, Math.round(x.invert(mx)));

      clipRect.attr("width", mx);

      let html = `<b>Lap ${lap}</b><br/>`;

      dots
        .style("opacity", 1)
        .attr("cx", mx)
        .attr("cy", (d) => {
          const v = d.data[lap - 1];
          if (!v) return -100;
          html += `${d.name}: P${v.position}<br/>`;
          return y(v.position);
        });

      chart
        .selectAll(".driver-label")
        .each(function (d) {
          const v = d.data[lap - 1];
          if (!v) return;
          placeDriverLabel(d3.select(this), d, x(v.lap), y(v.position));
        })
        .style("opacity", 1);

      // position tooltip but keep inside viewport (flip left/top if near edges)
      tooltip.html(html).style("opacity", 1);
      try {
        const tipNode = tooltip.node();
        const tipW = tipNode ? tipNode.offsetWidth : 200;
        const tipH = tipNode ? tipNode.offsetHeight : 100;
        const padding = 8;
        const cx = event.clientX || 0;
        const cy = event.clientY || 0;
        let left = cx + 12;
        if (left + tipW + padding > window.innerWidth) left = cx - tipW - 12;
        if (left < padding) left = padding;
        let top = cy + 12;
        if (top + tipH + padding > window.innerHeight) top = cy - tipH - 12;
        if (top < padding) top = padding;
        tooltip
          .style("left", left + "px")
          .style("top", top + "px")
          .style("opacity", 1);
      } catch {
        // fallback: place near cursor
        tooltip
          .style("left", event.clientX + 12 + "px")
          .style("top", event.clientY + 12 + "px")
          .style("opacity", 1);
      }
    }

    function reset() {
      clipRect.attr("width", innerWidth);
      dots.style("opacity", 0);
      tooltip.style("opacity", 0);

      chart.selectAll(".driver-label").each(function (d) {
        const lastLap = d.data[d.data.length - 1];
        if (lastLap) {
          d3.select(this)
            .transition()
            .duration(200)
            .call((selection) => placeDriverLabel(selection, d, x(lastLap.lap), y(lastLap.position)));
        }
      });
    }

    const overlay = chart
      .append("rect")
      .attr("width", innerWidth)
      .attr("height", innerHeight)
      .attr("fill", "transparent")
      .style("pointer-events", "all");

    overlay.on("mousemove", move);
    overlay.on("mouseleave", reset);

    overlay.node().addEventListener("touchmove", (e) => move(e.touches[0]), {
      passive: true,
    });

    overlay.node().addEventListener("touchend", reset, { passive: true });

    return () => {
      if (ref.current) {
        ref.current.innerHTML = "";
      }
    };
  }, [trackData, allResults, selectedDriverIds]);

  return (
    <div
      ref={ref}
      style={{
        width: "100%",
        maxWidth: "1200px",
        margin: "auto",
        overflowX: "hidden",
      }}
    />
  );
}
