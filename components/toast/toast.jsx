// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import PropTypes from 'prop-types';

import {FormattedMessage} from 'react-intl';
import {OverlayTrigger, Tooltip} from 'react-bootstrap';

import UnreadBelowIcon from 'components/widgets/icons/unread_below_icon';
import CloseIcon from 'components/widgets/icons/close_icon';
import Constants from 'utils/constants';
import {isMac} from 'utils/utils';

const MIN_TOAST_ZINDEX = 1;

export default class Toast extends React.PureComponent {
    static propTypes = {
        onClick: PropTypes.func,
        onClickMessage: PropTypes.string,
        onDismiss: PropTypes.func,
        children: PropTypes.element,
        show: PropTypes.bool.isRequired,
        showActions: PropTypes.bool, //used for showing jump actions
        width: PropTypes.number,
    }

    handleDismiss = () => {
        if (typeof this.props.onDismiss == 'function') {
            this.props.onDismiss();
        }
    }

    render() {
        let toastClass = 'toast';
        if (this.props.show) {
            toastClass += ' toast__visible';
        }

        let toastActionClass = 'toast__message';
        if (this.props.showActions) {
            toastActionClass += ' toast__pointer';
        }

        const jumpSection = () => {
            return (
                <div
                    className='toast__jump'
                >
                    <UnreadBelowIcon/>
                    {this.props.width > Constants.MOBILE_SCREEN_WIDTH && this.props.onClickMessage}
                </div>
            );
        };

        let onClickMessageToolTip = (<div/>);
        let closeTooltip = (<div/>);
        if (this.props.show) {
            let jumpToShortcutId = 'quick_switch_modal.jumpToShortcut.windows';
            let jumpToShortcutDefault = 'CTRL+J';
            if (isMac()) {
                jumpToShortcutId = 'quick_switch_modal.jumpToShortcut.mac';
                jumpToShortcutDefault = '⌘J';
            }

            closeTooltip = (
                <Tooltip id='toast-close__tooltip'>
                    <FormattedMessage
                        id='general_button.close'
                        defaultMessage='Close'
                    />
                    <div className='tooltip__shortcut--txt'>
                        <FormattedMessage
                            id='general_button.esc'
                            defaultMessage='esc'
                        />
                    </div>
                </Tooltip>
            );

            onClickMessageToolTip = (
                <Tooltip id='dismissToast1'>
                    {this.props.onClickMessage}
                    <div className='tooltip__shortcut--txt'>
                        <FormattedMessage
                            id={jumpToShortcutId}
                            defaultMessage={jumpToShortcutDefault}
                        />
                    </div>
                </Tooltip>
            );
        }

        return (
            <div
                className={toastClass}
                style={{zIndex: MIN_TOAST_ZINDEX}}
            >
                <div
                    className={toastActionClass}
                    onClick={this.props.showActions ? this.props.onClick : null}
                >
                    <OverlayTrigger
                        delayShow={Constants.OVERLAY_TIME_DELAY}
                        placement='bottom'
                        overlay={onClickMessageToolTip}
                    >
                        <div>
                            {this.props.showActions && jumpSection()}
                            {this.props.children}
                        </div>
                    </OverlayTrigger>
                </div>
                <div
                    className='toast__dismiss'
                    onClick={this.handleDismiss}
                >
                    <OverlayTrigger
                        delayShow={Constants.OVERLAY_TIME_DELAY}
                        placement='bottom'
                        overlay={closeTooltip}
                    >
                        <CloseIcon
                            className='close-btn'
                            id='dismissToast'
                        />
                    </OverlayTrigger>
                </div>
            </div>
        );
    }
}