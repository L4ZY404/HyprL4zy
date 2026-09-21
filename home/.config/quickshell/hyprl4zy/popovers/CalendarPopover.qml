import QtQuick
import Quickshell
import "../services"

Rectangle {
    id: root

    required property real unit
    required property color backgroundColor
    required property color foregroundColor
    required property color mutedColor
    required property color accentColor
    required property color surfaceColor

    property date displayedMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    readonly property date today: calendarClock.date
    SystemClock { id: calendarClock; precision: SystemClock.Minutes }
    readonly property int firstWeekday: (new Date(displayedMonth.getFullYear(), displayedMonth.getMonth(), 1).getDay() + 6) % 7
    readonly property int daysInMonth: new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 0).getDate()

    radius: unit * 0.28
    color: backgroundColor
    border.width: Math.max(1, unit * 0.025)
    border.color: backgroundColor
    antialiasing: true

    function previousMonth() {
        displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() - 1, 1)
    }

    function nextMonth() {
        displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 1)
    }

    function isToday(day) {
        return day > 0
            && today.getFullYear() === displayedMonth.getFullYear()
            && today.getMonth() === displayedMonth.getMonth()
            && today.getDate() === day
    }

    Text {
        id: title
        anchors {
            left: parent.left
            top: parent.top
            leftMargin: root.unit * 0.24
            topMargin: root.unit * 0.20
        }
        text: Qt.locale("en_US").monthName(root.displayedMonth.getMonth()) + " " + root.displayedMonth.getFullYear()
        color: root.accentColor
        font.pixelSize: UiScale.text(root.unit * 0.25, root.unit)
        font.weight: Font.Bold
    }

    Row {
        anchors {
            right: parent.right
            top: parent.top
            rightMargin: root.unit * 0.20
            topMargin: root.unit * 0.17
        }
        spacing: root.unit * 0.08

        Rectangle {
            width: root.unit * 0.44
            height: width
            radius: width / 2
            color: previousMouse.containsMouse ? root.surfaceColor : "transparent"

            Text {
                anchors.centerIn: parent
                text: "‹"
                color: root.foregroundColor
                font.pixelSize: UiScale.text(root.unit * 0.24, root.unit)
                font.weight: Font.Bold
            }

            MouseArea {
                id: previousMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: root.previousMonth()
            }
        }

        Rectangle {
            width: root.unit * 0.44
            height: width
            radius: width / 2
            color: nextMouse.containsMouse ? root.surfaceColor : "transparent"

            Text {
                anchors.centerIn: parent
                text: "›"
                color: root.foregroundColor
                font.pixelSize: UiScale.text(root.unit * 0.24, root.unit)
                font.weight: Font.Bold
            }

            MouseArea {
                id: nextMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: root.nextMonth()
            }
        }
    }

    Grid {
        id: weekdayGrid
        anchors {
            left: parent.left
            right: parent.right
            top: title.bottom
            leftMargin: root.unit * 0.22
            rightMargin: root.unit * 0.22
            topMargin: root.unit * 0.18
        }
        columns: 7
        columnSpacing: root.unit * 0.045
        rowSpacing: 0

        Repeater {
            model: ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]

            delegate: Item {
                required property var modelData
                width: (weekdayGrid.width - weekdayGrid.columnSpacing * 6) / 7
                height: root.unit * 0.34

                Text {
                    anchors.centerIn: parent
                    text: modelData
                    color: root.mutedColor
                    font.pixelSize: UiScale.text(root.unit * 0.105, root.unit)
                    font.weight: Font.DemiBold
                }
            }
        }
    }

    Grid {
        id: daysGrid
        anchors {
            left: weekdayGrid.left
            right: weekdayGrid.right
            top: weekdayGrid.bottom
            topMargin: root.unit * 0.06
        }
        columns: 7
        columnSpacing: root.unit * 0.045
        rowSpacing: root.unit * 0.045

        Repeater {
            model: 42

            delegate: Item {
                required property int index
                readonly property int dayNumber: index - root.firstWeekday + 1
                readonly property bool validDay: dayNumber >= 1 && dayNumber <= root.daysInMonth

                width: (daysGrid.width - daysGrid.columnSpacing * 6) / 7
                height: root.unit * 0.43

                Rectangle {
                    visible: validDay && root.isToday(dayNumber)
                    anchors.centerIn: parent
                    width: root.unit * 0.36
                    height: width
                    radius: width / 2
                    color: root.accentColor
                }

                Text {
                    anchors.centerIn: parent
                    visible: validDay
                    text: dayNumber
                    color: root.isToday(dayNumber) ? root.backgroundColor : root.foregroundColor
                    font.pixelSize: UiScale.text(root.unit * 0.12, root.unit)
                    font.weight: root.isToday(dayNumber) ? Font.Bold : Font.Medium
                }
            }
        }
    }
    Text {
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.bottom: parent.bottom
        anchors.bottomMargin: root.unit * 0.14
        text: "Today · " + Qt.formatDate(root.today, "yyyy-MM-dd")
        color: root.accentColor
        font.pixelSize: UiScale.text(root.unit * 0.14, root.unit)
        MouseArea {
            anchors.fill: parent
            cursorShape: Qt.PointingHandCursor
            onClicked: root.displayedMonth = new Date(root.today.getFullYear(), root.today.getMonth(), 1)
        }
    }

}
