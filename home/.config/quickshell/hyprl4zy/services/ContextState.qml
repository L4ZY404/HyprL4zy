pragma Singleton
import QtQuick

QtObject {
    id: root

    property var currentPopup: null

    function requestClose(popup) {
        if (!popup)
            return

        if (typeof popup.requestClose === "function")
            popup.requestClose()
        else
            popup.visible = false
    }

    function closeCurrent() {
        const popup = root.currentPopup
        root.currentPopup = null
        root.requestClose(popup)
    }

}
