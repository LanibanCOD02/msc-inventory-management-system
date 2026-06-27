// ─── Charts ────────────────────────────────────────

async function initCharts() {
  if (!window.echarts) return;
  
  try {
    const chartData = await apiFetch('/dashboard/charts?_t=' + Date.now());

    // Render Movement Chart
    const movementEl = document.getElementById("movementChart");
    let movementChart;
    if (movementEl) {
      movementChart = echarts.getInstanceByDom(movementEl) || echarts.init(movementEl);
      
      const weeks = chartData.weeklyMovements.map(w => w.week);
      const inward = chartData.weeklyMovements.map(w => w.inward);
      const outward = chartData.weeklyMovements.map(w => w.outward);

      movementChart.setOption({
        progressive: 0,
        progressiveThreshold: 3000,
        hoverLayerThreshold: 3000,
        tooltip: {
          trigger: "axis",
          transitionDuration: 0,
          showDelay: 0,
          hideDelay: 80,
          backgroundColor: "rgba(15,23,42,.88)",
          borderColor: "transparent",
          textStyle: { color: "#f8fafc", fontFamily: "Inter", fontSize: 12 },
          padding: [10, 14],
          borderRadius: 8,
          extraCssText: `
            transition: all 0.25s cubic-bezier(0.23, 1, 0.32, 1);
            will-change: transform, left, top;
            pointer-events: none;
          `,
          axisPointer: {
            type: "cross",
            crossStyle: { color: "#cbd5e1" },
            lineStyle: { color: "#e2e8f0" },
            animationDurationUpdate: 120,
            animationEasingUpdate: "cubicOut"
          }
        },
        legend: { data: ['Inward', 'Outward'], bottom: 0 },
        grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
        xAxis: { type: 'category', data: weeks },
        yAxis: { type: 'value' },
        color: ['#0d9488', '#f59e0b'],
        series: [
          { 
            name: 'Inward', 
            type: 'line', 
            smooth: true, 
            data: inward,
            emphasis: {
              disabled: false,
              scale: false
            }
          },
          { 
            name: 'Outward', 
            type: 'line', 
            smooth: true, 
            data: outward,
            emphasis: {
              disabled: false,
              scale: false
            }
          }
        ]
      }, true);
    }

    // Render Category Chart
    const catEl = document.getElementById("categoryChart");
    let categoryChart;
    if (catEl) {
      categoryChart = echarts.getInstanceByDom(catEl) || echarts.init(catEl, null, { renderer: 'svg' });
      
      let catData = [];
      if (window.inventory && window.inventory.length > 0) {
        const catMap = {};
        window.inventory.forEach(item => {
          const cat = item.category || 'Uncategorized';
          catMap[cat] = (catMap[cat] || 0) + item.stock;
        });
        catData = Object.entries(catMap).map(([name, value]) => ({ name, value }));
      } else {
        catData = chartData.categoryDistribution.map(c => ({
          name: c.category,
          value: c.totalStock
        }));
      }

      // If no inventory, show empty state
      if(catData.length === 0) {
        catData.push({ name: 'No items', value: 1 });
      }

      // Show empty state if only one or no categories
      const catElParent = catEl.parentElement;
      if (catData.length <= 1 && catData[0]?.name !== 'No items') {
        categoryChart.clear();
        let emptyOverlay = document.getElementById('categoryChartEmpty');
        catEl.style.display = 'none'; // Hide the 300px chart area
        
        if (!emptyOverlay) {
          emptyOverlay = document.createElement('div');
          emptyOverlay.id = 'categoryChartEmpty';
          emptyOverlay.style.background = 'var(--surface)';
          emptyOverlay.style.padding = '32px 20px';
          emptyOverlay.style.textAlign = 'center';
          emptyOverlay.style.borderRadius = '0 0 16px 16px';
          emptyOverlay.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;">
              <div style="width:48px;height:48px;border-radius:12px;background:var(--teal-50);display:grid;place-items:center">
                <i data-lucide="pie-chart" style="width:22px;height:22px;color:var(--teal)"></i>
              </div>
              <div>
                <p style="font:600 14px 'Outfit',sans-serif;color:var(--text);margin:0 0 4px">Only one category</p>
                <p style="font-size:12px;color:var(--muted);margin:0;">Add items across multiple categories to see the distribution chart</p>
              </div>
            </div>
          `;
          catElParent.appendChild(emptyOverlay);
          if (window.lucide) lucide.createIcons({ nodes: emptyOverlay.querySelectorAll('[data-lucide]') });
        } else {
          emptyOverlay.style.display = 'block';
        }
        return;
      } else {
        catEl.style.display = 'block'; // Show the chart area
        const emptyOverlay = document.getElementById('categoryChartEmpty');
        if (emptyOverlay) emptyOverlay.style.display = 'none';
      }


      categoryChart.setOption({
        tooltip: {
          trigger: 'item',
          transitionDuration: 0,
          showDelay: 0,
          hideDelay: 100,
          confine: true,
          enterable: false,
          position: function(point, params, dom, rect, size) {
            const [x, y] = point;
            const [boxW, boxH] = [size.contentSize[0], size.contentSize[1]];
            const [viewW, viewH] = [size.viewSize[0], size.viewSize[1]];
            let left = x + 14;
            let top = y - boxH / 2;
            if (left + boxW > viewW) left = x - boxW - 14;
            if (top < 0) top = 4;
            if (top + boxH > viewH) top = viewH - boxH - 4;
            return [left, top];
          },
          formatter: function(params) {
            const percent = params.percent;
            const value = params.value;
            const name = params.name;
            return `
              <div style="font-family:'Inter',sans-serif;min-width:150px;">
                <p style="
                  font-size:11px;font-weight:600;
                  color:#94a3b8;text-transform:uppercase;
                  letter-spacing:0.5px;margin:0 0 10px;
                ">Category</p>
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                  <span style="
                    width:10px;height:10px;border-radius:50%;
                    background:${params.color};
                    display:inline-block;flex-shrink:0;
                  "></span>
                  <span style="font-size:13px;font-weight:600;color:#0f172a">${name}</span>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid #f1f5f9">
                  <span style="font-size:12px;color:#475569">Stock</span>
                  <span style="font-size:13px;font-weight:700;color:#0f172a">${value}</span>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
                  <span style="font-size:12px;color:#475569">Share</span>
                  <span style="font-size:13px;font-weight:700;color:#0d9488">${percent}%</span>
                </div>
              </div>
            `;
          },
          backgroundColor: '#ffffff',
          borderColor: '#e2e8f0',
          borderWidth: 1,
          padding: [14, 16],
          extraCssText: `
            box-shadow: 0 8px 24px rgba(15,23,42,0.10);
            border-radius: 10px;
            pointer-events: none;
            transition: all 0.25s cubic-bezier(0.23, 1, 0.32, 1);
            will-change: transform, left, top;
          `
        },
        legend: { top: 'bottom', textStyle: { fontSize: 11 } },
        color: ['#0d9488','#6366f1','#f97316','#ec4899','#14b8a6','#f59e0b','#8b5cf6','#10b981'],
        series: [
          {
            name: 'Items',
            type: 'pie',
            radius: ['40%', '70%'],
            padAngle: 2,
            colorBy: 'data',
            itemStyle: {
              borderRadius: 4,
              borderWidth: 0,
              shadowBlur: 6,
              shadowColor: 'rgba(0,0,0,0.10)',
              shadowOffsetY: 2
            },
            emphasis: {
              scale: true,
              scaleSize: 6,
              itemStyle: {
                borderWidth: 0,
                opacity: 1
              },
              label: {
                show: true,
                fontSize: 12,
                fontWeight: '600',
                fontFamily: 'Outfit',
                color: '#0f172a',
                formatter: '{b}\n{d}%'
              }
            },
            label: { show: false },
            labelLine: { show: false },
            animationType: 'scale',
            animationDuration: 800,
            animationEasing: 'cubicOut',
            animationDelay: function(idx) { return idx * 80; },
            data: catData
          }
        ]
      }, true);

      setTimeout(() => {
        const svgEl = catEl.querySelector('svg');
        if (!svgEl) return;

        // Add glow filter definition
        if (!svgEl.querySelector('#sliceGlow')) {
          const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
          defs.innerHTML = `
            <filter id="sliceGlow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur"/>
              <feMerge>
                <feMergeNode in="blur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          `;
          svgEl.insertBefore(defs, svgEl.firstChild);
        }

        // Apply glow only on mouse enter, remove on mouse leave
        svgEl.addEventListener('mouseover', e => {
          const path = e.target.closest('path');
          if (path) path.style.filter = 'url(#sliceGlow)';
        });

        svgEl.addEventListener('mouseout', e => {
          const path = e.target.closest('path');
          if (path) path.style.filter = 'none';
        });

      }, 900);
    }

    // Resize on window change
    window.addEventListener('resize', () => {
      if (movementChart) movementChart.resize();
      if (categoryChart) categoryChart.resize();
    });

  } catch(err) {
    console.error('Failed to load chart data:', err);
  }
}


