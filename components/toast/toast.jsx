// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import PropTypes from 'prop-types';

import UnreadBelowIcon from 'components/widgets/icons/unread_below_icon';
import CloseIcon from 'components/widgets/icons/close_icon';

function empty() {
    // do nothing
}

const someBigNum = 1000;

export default class Toast extends React.PureComponent {
    static propTypes = {
        jumpTo: PropTypes.func.isRequired, // required?
        jumpToMessage: PropTypes.string,
        onDismiss: PropTypes.func,
        order: PropTypes.number,
        children: PropTypes.element,
    }

    constructor(props) {
        super(props);
        this.state = {
            show: true,
        };
    }

    handleJump = () => {
        this.props.jumpTo();
        this.setState({show: false});

        // TODO: telemetry
    }

    handleDismiss = () => {
        this.props.onDismiss();
        this.setState({show: false});

        // TODO: add telemetry
    }

    render() {
        let classes = 'toast';
        if (this.state.show) {
            classes += ' toast__visible';
        }

        return (
            <div className={classes}>
                <div
                    className='toast__jump'
                    onClick={this.handleJump}
                >
                    <UnreadBelowIcon/>
                    {this.props.jumpToMessage}
                </div>
                <div className='toast__message'>
                    {this.props.children}
                </div>
                <div
                    className='toast__dismiss'
                    onClick={this.handleDismiss}
                >
                    <CloseIcon className='close-x' id='dismissToast'/>
                </div>
            </div>
        );
    }
}

Toast.defaultProps = {
    onDismiss: empty,
    jumpToMessage: 'Jump',
    order: someBigNum,
};