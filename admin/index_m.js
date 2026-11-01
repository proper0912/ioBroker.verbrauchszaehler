// Verbrauchszähler - Copyright (c) by proper0912
// Please visit https://github.com/proper0912/ioBroker.verbrauchszaehler for licence-agreement and further information

//Settings
/* exported load, save */

// This will be called by the admin adapter when the settings page loads

function load(settings, onChange) {
	if (!settings) return;

	$(".value").each(function () {
		const $key = $(this);
		const id = $key.attr("id");
		if ($key.attr("type") === "checkbox") {
			// do not call onChange direct, because onChange could expect some arguments
			$key.prop("checked", settings[id]).on("change", function () {
				onChange();
			});
		} else {
			// do not call onChange direct, because onChange could expect some arguments
			$key.val(settings[id]).on("change", function () {
				onChange();
			}).on("keyup", function () {
				onChange();
			});
		}
	});
	onChange(false);
	M.updateTextFields();  // function Materialize.updateTextFields(); to reinitialize all the Materialize labels on the page if you are dynamically adding inputs.

	M.Range.init($("input[type=range]"));

	$("#triggerIDPopUp").on("click", function () {
		initSelectId(function (sid) {
			sid.selectId("show", $("#triggerID").val(), function (newId) {
				if (newId) {
					$("#triggerID").val(newId).trigger("change");
				}
			});
		});
	});
}

// ... and the function save has to exist.
// you have to make sure the callback is called with the settings object as first param!
function save(callback) {
	// example: select elements with class=value and build settings object
	const obj = {};
	$(".value").each(function () {
		const $this = $(this);
		if ($this.attr("type") === "checkbox") {
			obj[$this.attr("id")] = $this.prop("checked");
		} else {
			obj[$this.attr("id")] = $this.val();
		}
	});
	callback(obj);
}

let selectId;
function initSelectId(callback) {
	if (selectId) {
		return callback(selectId);
	}
	socket.emit("getObjects", function (err, objs) {
		selectId = $("#dialog-select-member").selectId("init", {
			noMultiselect: true,
			objects: objs,
			imgPath: "../../lib/css/fancytree/",
			filter: { type: "state" },
			name: "scenes-select-state",
			texts: {
				select: _("Select"),
				cancel: _("Cancel"),
				all: _("All"),
				id: _("ID"),
				name: _("Name"),
				role: _("Role"),
				room: _("Room"),
				value: _("Value"),
				selectid: _("Select ID"),
				from: _("From"),
				lc: _("Last changed"),
				ts: _("Time stamp"),
				wait: _("Processing..."),
				ack: _("Acknowledged"),
				selectAll: _("Select all"),
				unselectAll: _("Deselect all"),
				invertSelection: _("Invert selection")
			},
			columns: ["image", "name", "role", "room"]
		});
		callback(selectId);
	});
}

