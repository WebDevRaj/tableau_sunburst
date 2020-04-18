'use strict';

// Wrap everything in an anonymous function to avoid poluting the global namespace
(function () {
  // Event handlers for filter change
  let unregisterHandlerFunctions = [];

  let worksheet, worksheet2;
  // Use the jQuery document ready signal to know when everything has been initialized
  $(document).ready(function () {
    // Initialize tableau extension
    tableau.extensions.initializeAsync().then(function () {
      // Get worksheets from tableau dashboard
      worksheet = tableau.extensions.dashboardContent.dashboard.worksheets[0];
      worksheet2 = tableau.extensions.dashboardContent.dashboard.worksheets[1];
      // event listener for filters
      let unregisterHandlerFunction = worksheet.addEventListener(tableau.TableauEventType.FilterChanged, filterChangedHandler);
      var result;
      function filterChangedHandler(event) {
        // for filter change
        // Add fieldName with (||) for other filters
        if (event.fieldName === "Segment Name") {
          // reload summary data
          let dataArr = [];
          worksheet.getSummaryDataAsync().then(data => {
            let dataJson;
            data.data.map(d => {
              dataJson = {};
              dataJson[data.columns[0].fieldName] = d[0].value; //1st column 
              dataJson[data.columns[1].fieldName] = d[1].value; //2nd column 
              dataJson[data.columns[2].fieldName] = d[2].value; //3rd column 
              dataJson[data.columns[3].fieldName] = d[3].value; //4th column 
              dataArr.push(dataJson);
            });

            // converting data to heirarchical json
            result = _(dataArr)
              .groupBy(x => x["Segment Name"])
              .map((value1, key) => ({
                name: key, count: sum(value1), children: _(value1)
                  .groupBy(x => x["Family Name"])
                  .map((value2, key) => ({
                    name: key, count: sum(value2), children: _(value2)
                      .groupBy(x => x["Class Name"])
                      .map((value3, key) => ({ name: key, count: sum(value3), children: [] }))
                      .value()
                  }))
                  .value()
              }))
              .value();

            plotChart(result);
          });
        }
      }

      unregisterHandlerFunctions.push(unregisterHandlerFunction);

      // load data from worksheet
      let dataArr = [];
      worksheet.getSummaryDataAsync().then(data => {
        let dataJson;
        console.log(data);

        data.data.map(d => {
          dataJson = {};
          dataJson[data.columns[0].fieldName] = d[0].value; //1st column 
          dataJson[data.columns[1].fieldName] = d[1].value; //2nd column 
          dataJson[data.columns[2].fieldName] = d[2].value; //3rd column 
          dataJson[data.columns[3].fieldName] = d[3].value; //4th column 
          dataArr.push(dataJson);
        });

        // converting data to heirarchical json
        result = _(dataArr)
          .groupBy(x => x["Segment Name"])
          .map((value1, key) => ({
            name: key, count: sum(value1), children: _(value1)
              .groupBy(x => x["Family Name"])
              .map((value2, key) => ({
                name: key, count: sum(value2), children: _(value2)
                  .groupBy(x => x["Class Name"])
                  .map((value3, key) => ({ name: key, count: sum(value3), children: [] }))
                  .value()
              }))
              .value()
          }))
          .value();

        plotChart(result);
      });

      function sum(arr) {
        let count = 0;
        arr.forEach(element => {
          count += parseInt(element["SUM(Number of Records)"]);
        });
        return count;
      }
    });
  });

  // ========================== D3 CHART ===================== //
  function plotChart(data) {

    var div = d3.select("body").append("div")
      .attr("class", "tooltip")
      .style("opacity", 0);

    var width = 600,
      height = 600,
      radius = height / 2;

    var x = d3.scale.linear()
      .range([0, 2 * Math.PI]);

    var y = d3.scale.linear()
      .range([0, radius]);

    var color = d3.scale.category20c();
    var arc;
    function graph() {

      d3.select("svg").remove();
      var svg = d3.select("body").append("svg")
        .attr("width", width)
        .attr("height", height)
        .append("g")
        .attr("transform", "translate(" + width / 2 + "," + (height / 2) + ")");

      var partition = d3.layout.partition()
        .value(function (d) { return d.count; });

      arc = d3.svg.arc()
        .startAngle(function (d) {
          return Math.PI / 2 + Math.max(0, Math.min(2 * Math.PI, x(d.x)));
        })
        .endAngle(function (d) {
          return Math.PI / 2 + Math.max(0, Math.min(2 * Math.PI, x(d.x + d.dx)));
        })
        .innerRadius(function (d) { return Math.max(0, y(d.y)); })
        .outerRadius(function (d) { return Math.max(0, y(d.y + d.dy)); });

      var root = data[0];

      var g = svg.selectAll("g")
        .data(partition.nodes(root))
        .enter().append("g")
        .on("mouseover", function (d) {
          div.transition()
            .duration(200)
            .style("opacity", .9);
          div.html(d.name + "<br/> Count : " + d.count)
            .style("left", (d3.event.pageX + 10) + "px")
            .style("top", (d3.event.pageY - 28) + "px");
        })
        .on("mouseout", function (d) {
          div.transition()
            .duration(200)
            .style("opacity", 0);
        });

      var path = g.append("path")
        .attr("d", arc)
        .style("fill", function (d) { return color((d.children ? d : d.parent).name); })
        .on("click", (d) => click(d));
      var text = g.append("text")
        .attr("transform", function (d) {
          return "translate(" + arc.centroid(d) + ")rotate(" + computeTextRotation(d) + ")";
          // return "rotate(" + computeTextRotation(d) + ")";
        })
        .attr("text-anchor", "middle")
        .attr("dx", "0") // margin
        .attr("dy", ".35em") // vertical-align
        .text(function (d) {
          return d.dx * height > 7 ? `${d.name.substring(0, 10)}...` : "...";
        })

      function click(d) {
        // apply filters from d3 chart to worksheet2 to populate respective data
        let segment = "Segment Name", family = "Family Name", className = "Class Name";
        switch (d.depth) {
          case 0: {
            worksheet2.clearFilterAsync(family).then(
              worksheet2.clearFilterAsync(className).then(
                worksheet2.applyFilterAsync(segment, [d.name], tableau.FilterUpdateType.Replace)
              )
            )
            break;
          }
          case 1: {
            worksheet2.clearFilterAsync(className).then(
              worksheet2.applyFilterAsync(segment, [d.parent.name], tableau.FilterUpdateType.Replace).then(
                worksheet2.applyFilterAsync(family, [d.name], tableau.FilterUpdateType.Replace)
              )
            )
            break;
          }
          case 2: {
            worksheet2.applyFilterAsync(segment, [d.parent.parent.name], tableau.FilterUpdateType.Replace).then(
              worksheet2.applyFilterAsync(family, [d.parent.name], tableau.FilterUpdateType.Replace).then(
                worksheet2.applyFilterAsync(className, [d.name], tableau.FilterUpdateType.Replace)
              )
            )
            break;
          }
          default:
        }

        text.transition().attr("opacity", 0);

        path.transition()
          .duration(750)
          .attrTween("d", arcTween(d))
          .each("end", function (e, i) {
            // check if the animated element's data e lies within the visible angle span given in d
            if (e.x >= d.x && e.x < (d.x + d.dx)) {
              let startAngle = Math.PI / 2 + Math.max(0, Math.min(2 * Math.PI, x(e.x)));
              let endAngle = Math.PI / 2 + Math.max(0, Math.min(2 * Math.PI, x(e.x + e.dx)));
              // get a selection of the associated text element
              var arcText = d3.select(this.parentNode).select("text");
              // fade in the text element and recalculate positions
              arcText.transition().duration(750)
                .attr("opacity", 1)
                .text(d => {
                  return (endAngle - startAngle) > 0.080 ? `${d.name.substring(0, 10)}...` : "...";
                })
                .attr("transform", function () {
                  return "translate(" + arc.centroid(e) + ")rotate(" + computeTextRotation(e) + ")";
                })
                .attr("text-anchor", "middle")
            }
          });
      }
    }
    graph();

    // Interpolate the scales!
    function arcTween(d) {
      var xd = d3.interpolate(x.domain(), [d.x, d.x + d.dx]),
        yd = d3.interpolate(y.domain(), [d.y, 1]),
        yr = d3.interpolate(y.range(), [d.y ? 20 : 0, radius]);
      return function (d, i) {
        return i
          ? function (t) { return arc(d); }
          : function (t) { x.domain(xd(t)); y.domain(yd(t)).range(yr(t)); return arc(d); };
      };
    }

    function computeTextRotation(d) {
      var ang = (Math.PI / 2 + x(d.x + d.dx / 2) - Math.PI / 2) / Math.PI * 180;
      return (ang > 270 || ang < 90) ? ang : 180 + ang;
    }
  }
})();
