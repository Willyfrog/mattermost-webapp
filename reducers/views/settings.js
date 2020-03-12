// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {ActionTypes} from 'utils/constants';

export default function settings(state = {}, action) {
    switch (action.type) {
    case ActionTypes.UPDATE_ACTIVE_SECTION:
        console.log({
            activeSection: action.data,
            previousActiveSection: state.activeSection,
        });
        return {
            activeSection: action.data,
            previousActiveSection: state.activeSection,
        };
    case ActionTypes.SETUP_PREVIOUS_ACTIVE_SECTION:
        return {
            activeSection: '',
            previousActiveSection: action.data,
        }
    default:
        return state;
    }
}